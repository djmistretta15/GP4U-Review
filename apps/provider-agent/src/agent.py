"""
GP4U Provider Agent — Main Daemon
==================================

The entry point for the provider-side daemon.

Startup sequence:
  1. Load config (token, region, API URL)
  2. Discover GPUs
  3. Register GPUs with the platform (POST /api/gpus/register)
  4. Poll for job assignments every 15s
  5. For each assigned job: spin up JobRunner in a thread
  6. Report heartbeat every 60s

Safe shutdown:
  SIGTERM → finish current job → deregister → exit
  SIGKILL → container is auto-removed by Docker --rm flag on next platform sweep
"""

from __future__ import annotations
import argparse
import json
import logging
import os
import signal
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Optional

import requests

from .gpu_discovery import discover_gpus, GpuInfo
from .job_runner import JobRunner, JobManifest

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level  = logging.INFO,
    format = "[%(asctime)s] %(levelname)s %(name)s — %(message)s",
    datefmt= "%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("gp4u.agent")

# ─── Config ───────────────────────────────────────────────────────────────────

CONFIG_PATH = Path.home() / ".gp4u" / "provider.json"

def load_config(path: Path) -> dict:
    if path.exists():
        return json.loads(path.read_text())
    return {}

def save_config(path: Path, cfg: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cfg, indent=2))

# ─── Provider Agent ───────────────────────────────────────────────────────────

class ProviderAgent:
    def __init__(
        self,
        api_url:       str,
        token:         str,
        region:        str,
        poll_interval: int = 15,
    ):
        self.api_url       = api_url.rstrip("/")
        self.token         = token
        self.region        = region
        self.poll_interval = poll_interval
        self.node_id       = str(uuid.uuid4())

        self._running      = True
        self._active_jobs: dict[str, threading.Thread] = {}
        self._registered_gpu_ids: dict[str, str] = {}  # uuid → platform id

    # ─── Headers ──────────────────────────────────────────────────────────────

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type":  "application/json",
            "X-Node-Id":     self.node_id,
        }

    # ─── GPU Registration ─────────────────────────────────────────────────────

    def register_gpus(self) -> list[str]:
        """
        Discover and register all GPUs with the platform.
        Returns list of platform-assigned GPU IDs.
        """
        gpus = discover_gpus()
        log.info(f"Discovered {len(gpus)} GPU(s)")

        platform_ids = []
        for gpu in gpus:
            try:
                resp = requests.post(
                    f"{self.api_url}/api/gpus/register",
                    json    = gpu.to_register_payload(self.token, self.region),
                    headers = self._headers(),
                    timeout = 10,
                )
                if resp.ok:
                    data = resp.json()
                    gid  = data.get("id") or data.get("gpu_id")
                    self._registered_gpu_ids[gpu.uuid] = gid
                    platform_ids.append(gid)
                    log.info(f"  ✓ {gpu.name} registered — platform ID: {gid}")
                else:
                    log.warning(f"  ✗ {gpu.name} registration failed: {resp.status_code} {resp.text[:200]}")
            except Exception as e:
                log.error(f"  ✗ GPU registration error: {e}")

        return platform_ids

    # ─── Job Polling ──────────────────────────────────────────────────────────

    def poll_jobs(self) -> list[dict]:
        """
        Poll for job assignments from the platform.
        Returns a list of JobManifest dicts.
        """
        try:
            gpu_ids = list(self._registered_gpu_ids.values())
            if not gpu_ids:
                return []

            resp = requests.get(
                f"{self.api_url}/api/jobs/assigned",
                params  = {"gpu_ids": ",".join(gpu_ids), "node_id": self.node_id},
                headers = self._headers(),
                timeout = 10,
            )
            if resp.ok:
                return resp.json().get("jobs", [])
            elif resp.status_code == 404:
                return []  # No jobs — normal
            else:
                log.warning(f"Poll returned {resp.status_code}: {resp.text[:200]}")
                return []
        except requests.Timeout:
            log.debug("Job poll timed out — will retry")
            return []
        except Exception as e:
            log.error(f"Job poll error: {e}")
            return []

    # ─── Job Execution ────────────────────────────────────────────────────────

    def _accept_job(self, raw: dict):
        """Accept a job assignment and start a runner thread."""
        job_id = raw.get("id") or raw.get("job_id")
        if not job_id:
            log.warning(f"Job assignment missing id field: {raw}")
            return

        if job_id in self._active_jobs:
            return  # Already running

        # ACK to the platform
        try:
            requests.post(
                f"{self.api_url}/api/jobs/{job_id}/accept",
                json    = {"node_id": self.node_id},
                headers = self._headers(),
                timeout = 5,
            )
        except Exception as e:
            log.error(f"ACK failed for {job_id}: {e}")
            return

        # Build manifest
        manifest = JobManifest(
            job_id              = job_id,
            subject_id          = raw.get("subject_id", "unknown"),
            gpu_id              = raw.get("gpu_id", ""),
            gpu_index           = raw.get("gpu_index", 0),
            docker_image        = raw.get("docker_image", "alpine:latest"),
            docker_image_sha256 = raw.get("docker_image_sha256", ""),
            command             = raw.get("command", ["echo", "hello"]),
            env                 = raw.get("env", {}),
            input_data_url      = raw.get("input_data_url"),
            output_bucket       = raw.get("output_bucket", ""),
            declared_framework  = raw.get("declared_framework", "UNKNOWN"),
            vram_allocated_gb   = float(raw.get("vram_allocated_gb", 8.0)),
            ram_limit_gb        = float(raw.get("ram_limit_gb", 32.0)),
            expected_duration_h = float(raw.get("expected_duration_h", 1.0)),
            power_cap_watts     = float(raw.get("power_cap_watts", 300.0)),
        )

        def run_and_report():
            runner = JobRunner(
                manifest  = manifest,
                api_url   = self.api_url,
                api_token = self.token,
                node_id   = self.node_id,
            )
            result = runner.run()

            # Report completion to platform
            try:
                requests.patch(
                    f"{self.api_url}/api/jobs",
                    json    = {
                        "id":         result["job_id"],
                        "status":     result["status"],
                        "energy_kwh": result["energy_kwh"],
                    },
                    headers = self._headers(),
                    timeout = 10,
                )
            except Exception as e:
                log.error(f"Job completion report failed: {e}")
            finally:
                self._active_jobs.pop(job_id, None)

        t = threading.Thread(target=run_and_report, name=f"job-{job_id[:8]}", daemon=True)
        self._active_jobs[job_id] = t
        t.start()
        log.info(f"[agent] Job {job_id} started on GPU #{manifest.gpu_index}")

    # ─── Heartbeat ────────────────────────────────────────────────────────────

    def _send_heartbeat(self):
        """Tell the platform this node is alive and report active job count."""
        try:
            requests.post(
                f"{self.api_url}/api/nodes/heartbeat",
                json = {
                    "node_id":     self.node_id,
                    "active_jobs": len(self._active_jobs),
                    "gpu_ids":     list(self._registered_gpu_ids.values()),
                    "timestamp":   time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                },
                headers = self._headers(),
                timeout = 5,
            )
        except Exception:
            pass  # Heartbeat failure is non-fatal

    # ─── Main Loop ────────────────────────────────────────────────────────────

    def run(self):
        log.info(f"GP4U Provider Agent starting — node {self.node_id}")
        log.info(f"Platform: {self.api_url}")
        log.info(f"Region:   {self.region}")

        # Register GPUs
        gpu_ids = self.register_gpus()
        if not gpu_ids:
            log.error("No GPUs registered — exiting")
            sys.exit(1)

        log.info(f"Agent ready. Polling for jobs every {self.poll_interval}s… (Ctrl+C to stop)")

        heartbeat_counter = 0
        while self._running:
            # Poll for jobs
            jobs = self.poll_jobs()
            for job in jobs:
                self._accept_job(job)

            # Heartbeat every 60s
            heartbeat_counter += 1
            if heartbeat_counter >= (60 // self.poll_interval):
                self._send_heartbeat()
                heartbeat_counter = 0

            if jobs:
                log.info(f"[agent] {len(jobs)} job(s) received, {len(self._active_jobs)} running")

            time.sleep(self.poll_interval)

        # Shutdown
        log.info("Shutting down — waiting for active jobs to finish…")
        for t in self._active_jobs.values():
            t.join(timeout=300)
        log.info("All jobs complete. Agent exited cleanly.")

    def stop(self):
        self._running = False


# ─── Entry Point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="GP4U Provider Agent")
    parser.add_argument("--api-url", default=os.getenv("GP4U_API_URL", "https://gp4u.com"),
                        help="Platform API URL")
    parser.add_argument("--token",   default=os.getenv("GP4U_PROVIDER_TOKEN"),
                        help="Provider token (from your dashboard)")
    parser.add_argument("--region",  default=os.getenv("GP4U_REGION", "us-east-1"),
                        help="Geographic region of your hardware")
    parser.add_argument("--poll",    type=int, default=15,
                        help="Job poll interval in seconds (default: 15)")
    args = parser.parse_args()

    if not args.token:
        print("ERROR: --token is required. Get yours at https://gp4u.com/dashboard/provider")
        sys.exit(1)

    agent = ProviderAgent(
        api_url       = args.api_url,
        token         = args.token,
        region        = args.region,
        poll_interval = args.poll,
    )

    signal.signal(signal.SIGTERM, lambda s, f: agent.stop())
    signal.signal(signal.SIGINT,  lambda s, f: agent.stop())

    agent.run()


if __name__ == "__main__":
    main()
