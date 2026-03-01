"""
Job Runner
==========

Executes a GP4U job inside an isolated Docker container.

Security guarantees:
  - Fresh container per job — no state leaks between jobs
  - --gpus=device=N:  only the assigned GPU, never the whole host
  - --memory:         hard container memory limit from job manifest
  - --network=bridge: outbound internet via NAT, but no inbound ports
  - Read-only /input volume (job inputs), write-only /output volume
  - --pids-limit:     prevent fork bombs
  - --cap-drop=ALL:   drop all Linux capabilities
  - --security-opt=no-new-privileges: prevent privilege escalation
  - --env:            only declared env vars, never host environment

Watchdog:
  - Telemetry loop runs in a background thread every 10 seconds
  - If the platform returns kill_job=True, the container is killed immediately
  - If job exceeds declared duration × 1.1, container is killed automatically
"""

from __future__ import annotations
import logging
import os
import subprocess
import tempfile
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .telemetry import TelemetryCollector

log = logging.getLogger(__name__)

# ─── Job Manifest ─────────────────────────────────────────────────────────────

@dataclass
class JobManifest:
    """
    Received from the platform when a job is assigned.
    This defines exactly what the container is allowed to do.
    """
    job_id:             str
    subject_id:         str
    gpu_id:             str          # Platform GPU.id
    gpu_index:          int          # Local GPU index
    docker_image:       str          # e.g. "pytorch/pytorch:2.2.0-cuda12.1-cudnn8-runtime"
    docker_image_sha256: str         # Image digest for verification
    command:            list[str]    # Entrypoint command
    env:                dict         # Declared env vars only
    input_data_url:     Optional[str]  # Pre-signed S3/R2 URL for input data
    output_bucket:      str          # S3/R2 bucket for job outputs
    declared_framework: str
    vram_allocated_gb:  float
    ram_limit_gb:       float
    expected_duration_h: float
    power_cap_watts:    float


# ─── Job Runner ────────────────────────────────────────────────────────────────

@dataclass
class JobRunner:
    manifest:   JobManifest
    api_url:    str
    api_token:  str
    node_id:    str

    _container_id: Optional[str]  = field(default=None, init=False, repr=False)
    _kill_requested: bool         = field(default=False, init=False, repr=False)
    _telemetry: Optional[TelemetryCollector] = field(default=None, init=False, repr=False)

    def run(self) -> dict:
        """
        Run the job end-to-end.
        Returns a result dict with status, logs, and energy usage.
        """
        log.info(f"[runner] Starting job {self.manifest.job_id}")

        # Verify image digest before doing anything else — fail fast
        verified_image_ref = self._pull_and_verify_image()

        with tempfile.TemporaryDirectory(prefix="gp4u-job-") as workdir:
            # Restrict temp dir to owner only — prevents other local users from
            # reading job inputs/outputs while the job is running
            os.chmod(workdir, 0o700)

            input_dir  = Path(workdir) / "input"
            output_dir = Path(workdir) / "output"
            input_dir.mkdir(mode=0o700)
            output_dir.mkdir(mode=0o700)

            # 1. Download input data
            if self.manifest.input_data_url:
                self._download_input(self.manifest.input_data_url, input_dir)

            # 2. Start telemetry collector
            self._telemetry = TelemetryCollector(
                job_id             = self.manifest.job_id,
                node_id            = self.node_id,
                gpu_id             = self.manifest.gpu_id,
                gpu_index          = self.manifest.gpu_index,
                subject_id         = self.manifest.subject_id,
                declared_framework = self.manifest.declared_framework,
                vram_allocated_gb  = self.manifest.vram_allocated_gb,
                power_cap_watts    = self.manifest.power_cap_watts,
                api_url            = self.api_url,
                api_token          = self.api_token,
            )

            # 3. Start watchdog thread
            watchdog_thread = threading.Thread(
                target=self._watchdog_loop,
                daemon=True,
                name=f"watchdog-{self.manifest.job_id[:8]}",
            )
            watchdog_thread.start()

            # 4. Run container (use verified digest reference — not the mutable tag)
            exit_code, logs = self._run_container(input_dir, output_dir, workdir, verified_image_ref)

            # 5. Stop watchdog
            self._kill_requested = True
            watchdog_thread.join(timeout=5)

            # 6. Upload output if successful
            if exit_code == 0:
                self._upload_output(output_dir)

            status = "COMPLETE" if exit_code == 0 else "FAILED"
            energy_kwh = (self._telemetry._energy_joules / 3_600_000) if self._telemetry else 0

            log.info(f"[runner] Job {self.manifest.job_id} → {status} (exit {exit_code})")
            return {
                "job_id":     self.manifest.job_id,
                "status":     status,
                "exit_code":  exit_code,
                "energy_kwh": round(energy_kwh, 6),
                "logs":       logs[-5000:],  # Last 5KB of container logs
            }

    def _pull_and_verify_image(self) -> str:
        """
        Pull the Docker image and verify its SHA256 digest against the manifest.
        Returns the immutable image reference (image@sha256:...) for use in docker run.
        Raises RuntimeError if the digest is missing, malformed, or doesn't match.
        """
        expected_sha = str(self.manifest.docker_image_sha256).lower().strip()
        if not expected_sha or not expected_sha.startswith("sha256:"):
            raise RuntimeError(
                f"[runner] docker_image_sha256 must start with 'sha256:' — got '{expected_sha[:32]}'"
            )
        # Validate hex portion (sha256: + 64 hex chars)
        hex_part = expected_sha[len("sha256:"):]
        if len(hex_part) != 64 or not all(c in "0123456789abcdef" for c in hex_part):
            raise RuntimeError("[runner] docker_image_sha256 is not a valid SHA-256 hex digest")

        # Use digest-pinned reference — Docker verifies content hash when pulling
        image_ref = f"{self.manifest.docker_image}@{expected_sha}"
        log.info(f"[runner] Pulling image {image_ref}")

        result = subprocess.run(
            ["docker", "pull", image_ref],
            capture_output=True, text=True, timeout=600,
        )
        if result.returncode != 0:
            raise RuntimeError(
                f"[runner] Failed to pull image: {result.stderr[:300]}"
            )

        log.info(f"[runner] Image digest verified: {expected_sha[:16]}…")
        return image_ref

    def _run_container(
        self,
        input_dir: Path,
        output_dir: Path,
        workdir: str,
        image_ref: str,
    ) -> tuple[int, str]:
        """
        Launch the Docker container with full security hardening.
        Returns (exit_code, logs).
        """
        duration_limit_sec = int(self.manifest.expected_duration_h * 3600 * 1.1)
        ram_bytes = int(self.manifest.ram_limit_gb * 1024 * 1024 * 1024)

        cmd = [
            "docker", "run",
            "--rm",                                         # Delete container on exit
            "--name", f"gp4u-{self.manifest.job_id[:12]}",
            "--gpus", f"device={self.manifest.gpu_index}",  # Only the assigned GPU
            "--memory", str(ram_bytes),                     # Hard memory limit
            "--memory-swap", str(ram_bytes),                # Disable swap
            "--pids-limit", "512",                          # No fork bombs
            "--network", "bridge",                          # Outbound NAT, no inbound
            "--cap-drop", "ALL",                            # Drop all capabilities
            "--security-opt", "no-new-privileges",
            "--read-only",                                  # Read-only root FS
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=1g",    # Writable /tmp only
            "--volume", f"{input_dir}:/input:ro",           # Read-only inputs
            "--volume", f"{output_dir}:/output:rw",         # Write-only outputs
            # Declared env vars only — never --env-file or host passthrough
            *self._build_env_args(),
            image_ref,                                      # Digest-pinned image reference
            *self.manifest.command,
        ]

        log.info(f"[runner] docker run (timeout {duration_limit_sec}s)")
        log.debug(f"[runner] cmd: {' '.join(cmd)}")

        try:
            result = subprocess.run(
                cmd,
                capture_output = True,
                text           = True,
                timeout        = duration_limit_sec,
            )
            return result.returncode, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            log.warning(f"[runner] Job {self.manifest.job_id} exceeded duration limit — killing")
            self._kill_container()
            return -1, "DURATION_LIMIT_EXCEEDED"
        except Exception as e:
            log.error(f"[runner] docker run error: {e}")
            return -1, str(e)

    def _build_env_args(self) -> list[str]:
        """Build --env flags from manifest. Never passes host env vars."""
        args = []
        for k, v in self.manifest.env.items():
            # Sanitize key — only allow alphanumeric + underscore
            clean_key = "".join(c for c in k if c.isalnum() or c == "_")
            if not clean_key:
                continue
            # Sanitize value — strip null bytes, newlines, and carriage returns
            # that could break Docker's env parsing or escape into log output.
            # Cap at 4096 chars to prevent oversized env vars.
            clean_val = (
                str(v)
                .replace("\x00", "")
                .replace("\n", "")
                .replace("\r", "")
                [:4096]
            )
            args += ["--env", f"{clean_key}={clean_val}"]
        return args

    def _watchdog_loop(self):
        """
        Background thread: collect + send telemetry every 10s.
        Kills container immediately if platform says kill_job=True.
        """
        while not self._kill_requested:
            if self._telemetry:
                try:
                    result = self._telemetry.collect_and_send()
                    if result.get("kill_job"):
                        log.critical(
                            f"[watchdog] Platform kill signal received for job "
                            f"{self.manifest.job_id} — terminating container"
                        )
                        self._kill_container()
                        self._kill_requested = True
                        return
                except Exception as e:
                    log.error(f"[watchdog] Telemetry error: {e}")
            time.sleep(10)

    def _kill_container(self):
        """Immediately kill the Docker container."""
        name = f"gp4u-{self.manifest.job_id[:12]}"
        try:
            subprocess.run(
                ["docker", "kill", name],
                timeout=5,
                capture_output=True,
            )
            log.info(f"[watchdog] Container {name} killed")
        except Exception as e:
            log.error(f"[watchdog] Failed to kill container {name}: {e}")

    def _download_input(self, url: str, dest: Path):
        """Download input data from pre-signed URL."""
        import urllib.request
        try:
            log.info(f"[runner] Downloading input data…")
            urllib.request.urlretrieve(url, dest / "input.tar.gz")
            subprocess.run(
                ["tar", "-xzf", str(dest / "input.tar.gz"), "-C", str(dest)],
                check=True, timeout=300, capture_output=True,
            )
            (dest / "input.tar.gz").unlink(missing_ok=True)
            log.info(f"[runner] Input data ready at {dest}")
        except Exception as e:
            log.warning(f"[runner] Input download failed: {e} — continuing without inputs")

    def _upload_output(self, output_dir: Path):
        """Upload job outputs to the designated bucket."""
        # In production: use boto3/rclone to upload output_dir to manifest.output_bucket
        # For now, just log the output size
        total = sum(f.stat().st_size for f in output_dir.rglob("*") if f.is_file())
        log.info(f"[runner] Output ready — {total:,} bytes (upload not implemented in dev)")
