"""
Telemetry Collector
===================

Collects per-job runtime signals from:
  - pynvml (GPU util, VRAM, power, temperature)
  - psutil (network, process)
  - Passive compute-pattern inference

Builds a RussianDollJobMetrics-compatible payload and POSTs it to
POST /api/telemetry/russian-doll.

The platform's bridge translates this into RuntimeSignals for Tutela.
The response tells us if we need to kill the job (kill_job=True).
"""

from __future__ import annotations
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Optional

import psutil  # type: ignore
import requests

log = logging.getLogger(__name__)

# Known mining pool domains (basic list — platform syncs a fuller one via threat intel)
MINING_POOL_DOMAINS = {
    "pool.minergate.com", "xmrpool.eu", "mining.bitcoin.cz",
    "pool.nicehash.com", "stratum.antpool.com", "f2pool.com",
}


@dataclass
class TelemetryCollector:
    job_id:          str
    node_id:         str
    gpu_id:          str         # GP4U GPU.id (platform-assigned)
    gpu_index:       int         # Local GPU index (0, 1, 2…)
    subject_id:      str
    declared_framework: str
    vram_allocated_gb: float
    power_cap_watts:  float
    api_url:          str
    api_token:        str

    # State accumulated across samples
    _samples:         list = field(default_factory=list, init=False, repr=False)
    _start_time:      float = field(default_factory=time.time, init=False, repr=False)
    _energy_joules:   float = field(default=0.0, init=False, repr=False)

    def collect_and_send(self) -> dict:
        """
        Collect one sample and POST to the platform.
        Returns the platform's response (check kill_job field).
        """
        payload = self._build_payload()
        return self._send(payload)

    def _build_payload(self) -> dict:
        gpu_signals  = self._collect_gpu()
        net_signals  = self._collect_network()
        proc_signals = self._collect_processes()

        # Infer compute pattern from GPU utilization + network
        pattern = self._infer_pattern(
            gpu_util    = gpu_signals["gpu_utilization_pct"],
            outbound    = net_signals["outbound_bytes_per_sec"],
            unique_ips  = net_signals["unique_dst_ips"],
            suspicious  = net_signals["suspicious_destinations"],
        )

        elapsed = time.time() - self._start_time

        return {
            # Identity
            "job_id":     self.job_id,
            "node_id":    self.node_id,
            "gpu_id":     self.gpu_id,
            "subject_id": self.subject_id,
            "timestamp":  time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),

            # Scheduler metrics (simplified — real Russian-Doll runs inside container)
            "total_dies":               1,
            "total_tasks_scheduled":    0,
            "total_tasks_completed":    0,
            "tasks_pending":            0,
            "tasks_active":             1,
            "total_energy_consumed_fj": self._energy_joules * 1e15,
            "throughput_tasks_per_sec": 0.0,
            "energy_per_task_fj":       0.0,
            "elapsed_time_seconds":     elapsed,
            "scheduler_policy":         "load_balanced",
            "die_utilization":          {},

            # GPU telemetry
            **gpu_signals,

            # Network telemetry
            **net_signals,

            # Process telemetry
            **proc_signals,

            # Workload
            "declared_framework":  self.declared_framework,
            "gpu_compute_pattern": pattern,
        }

    def _collect_gpu(self) -> dict:
        """Collect GPU metrics via pynvml."""
        try:
            import pynvml  # type: ignore
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(self.gpu_index)

            util      = pynvml.nvmlDeviceGetUtilizationRates(handle)
            mem       = pynvml.nvmlDeviceGetMemoryInfo(handle)
            power     = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # mW → W
            temp      = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)

            try:
                throttle = bool(pynvml.nvmlDeviceGetCurrentClocksThrottleReasons(handle))
            except Exception:
                throttle = False

            vram_used = round(mem.used / (1024 ** 3), 2)
            pynvml.nvmlShutdown()

            # Accumulate energy (W × Δt = J)
            self._energy_joules += power * 10  # assume 10s interval

            return {
                "gpu_utilization_pct": util.gpu,
                "vram_used_gb":        vram_used,
                "vram_allocated_gb":   self.vram_allocated_gb,
                "power_draw_watts":    round(power, 1),
                "power_cap_watts":     self.power_cap_watts,
                "temperature_c":       temp,
                "thermal_throttling":  throttle,
            }
        except Exception as e:
            log.debug(f"GPU telemetry unavailable: {e}")
            return {
                "gpu_utilization_pct": 0,
                "vram_used_gb":        0.0,
                "vram_allocated_gb":   self.vram_allocated_gb,
                "power_draw_watts":    0.0,
                "power_cap_watts":     self.power_cap_watts,
                "temperature_c":       0,
                "thermal_throttling":  False,
            }

    def _collect_network(self) -> dict:
        """Collect network signals via psutil."""
        try:
            conns = psutil.net_connections(kind="inet")
            active = [c for c in conns if c.status == "ESTABLISHED"]

            dst_ips = {c.raddr.ip for c in active if c.raddr}
            suspicious = [ip for ip in dst_ips if self._is_suspicious(ip)]

            net = psutil.net_io_counters()
            # Store counters for delta calculation
            if not hasattr(self, "_prev_net"):
                self._prev_net = net  # type: ignore
            delta_out = max(0, net.bytes_sent - self._prev_net.bytes_sent)  # type: ignore
            delta_in  = max(0, net.bytes_recv - self._prev_net.bytes_recv)  # type: ignore
            self._prev_net = net  # type: ignore

            dns_conns = [c for c in conns if c.raddr and c.raddr.port == 53]

            return {
                "outbound_bytes_per_sec":  delta_out // 10,  # 10s interval
                "inbound_bytes_per_sec":   delta_in  // 10,
                "active_connections":      len(active),
                "unique_dst_ips":          len(dst_ips),
                "dns_queries_per_min":     len(dns_conns) * 6,
                "suspicious_destinations": suspicious,
            }
        except Exception as e:
            log.debug(f"Network telemetry unavailable: {e}")
            return {
                "outbound_bytes_per_sec": 0,
                "inbound_bytes_per_sec":  0,
                "active_connections":     0,
                "unique_dst_ips":         0,
                "dns_queries_per_min":    0,
                "suspicious_destinations": [],
            }

    def _collect_processes(self) -> dict:
        """Collect process signals — unexpected processes, privilege escalation attempts."""
        try:
            procs = [p.name() for p in psutil.process_iter(["name"]) if p.pid != os.getpid()]
            # Common legit ML framework binaries
            LEGIT = {"python", "python3", "nvidia-smi", "cudnn", "nccl", "bash",
                     "sh", "ps", "top", "htop", "grep", "awk", "tail", "cat"}
            unexpected = [p for p in procs if p.lower() not in LEGIT and
                         not p.startswith("python") and len(p) > 2]

            return {
                "process_count":                   len(procs),
                "unexpected_processes":            unexpected[:20],  # Cap to keep payload small
                "privilege_escalation_attempts":   0,  # Would need kernel audit log access
                "filesystem_writes_per_sec":       0.0,
            }
        except Exception:
            return {
                "process_count":                 0,
                "unexpected_processes":          [],
                "privilege_escalation_attempts": 0,
                "filesystem_writes_per_sec":     0.0,
            }

    def _infer_pattern(
        self,
        gpu_util: float,
        outbound: int,
        unique_ips: int,
        suspicious: list,
    ) -> str:
        if suspicious:
            return "CRYPTO_MINING"
        if gpu_util > 85 and outbound < 5_000_000:
            return "TRAINING"
        if unique_ips > 30 and gpu_util < 20:
            return "NETWORK_HEAVY"
        if gpu_util < 5:
            return "IDLE"
        return "INFERENCE"

    def _is_suspicious(self, ip: str) -> bool:
        # Check against known mining pools (domain resolution would be better,
        # but requires DNS lookup per connection — too slow for hot path)
        # Platform sends updated threat intel lists via the job manifest
        return False  # Production: check against Tutela's threat intel feed

    def _send(self, payload: dict) -> dict:
        """POST telemetry to the platform. Returns response dict."""
        try:
            resp = requests.post(
                f"{self.api_url}/api/telemetry/russian-doll",
                json    = payload,
                timeout = 5,
                headers = {"Content-Type": "application/json"},
            )
            data = resp.json()
            if data.get("kill_job"):
                log.critical(
                    f"[telemetry] KILL SIGNAL received for job {self.job_id} — "
                    f"action: {data.get('action')}, anomalies: {data.get('anomalies')}"
                )
            return data
        except requests.Timeout:
            log.warning(f"[telemetry] POST timeout for job {self.job_id}")
            return {"ok": False, "kill_job": False}
        except Exception as e:
            log.error(f"[telemetry] POST error: {e}")
            return {"ok": False, "kill_job": False}
