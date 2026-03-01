"""
GPU Discovery
=============

Discovers all NVIDIA GPUs on this machine using pynvml (nvidia-smi bindings).
Falls back to a mock list in CI / non-GPU environments.

Returns a list of GpuInfo dataclasses ready to be sent to the platform's
/api/gpus/register endpoint.
"""

from __future__ import annotations
import logging
import os
import subprocess
from dataclasses import dataclass, asdict
from typing import Optional

log = logging.getLogger(__name__)

# ─── GPU Info ──────────────────────────────────────────────────────────────────

@dataclass
class GpuInfo:
    uuid: str               # Unique per physical GPU, stable across reboots
    name: str               # e.g. "NVIDIA GeForce RTX 4090"
    vram_gb: float
    driver_version: str
    cuda_version: Optional[str]
    total_memory_mb: int
    pcie_link_gen: int
    pcie_link_width: int

    def to_register_payload(self, provider_token: str, region: str) -> dict:
        return {
            "uuid":          self.uuid,
            "name":          self.name,
            "vram_gb":       self.vram_gb,
            "driver":        self.driver_version,
            "cuda":          self.cuda_version,
            "region":        region,
            "provider_token": provider_token,
        }


# ─── Discovery ─────────────────────────────────────────────────────────────────

def discover_gpus() -> list[GpuInfo]:
    """
    Discover all GPUs on this host.
    Tries pynvml first, falls back to parsing nvidia-smi, then to mock data.
    """
    try:
        return _discover_via_pynvml()
    except Exception as e:
        log.warning(f"pynvml discovery failed: {e} — trying nvidia-smi fallback")

    try:
        return _discover_via_nvidiasmi()
    except Exception as e:
        log.warning(f"nvidia-smi fallback failed: {e} — using mock GPU data")

    return _mock_gpus()


def _discover_via_pynvml() -> list[GpuInfo]:
    import pynvml  # type: ignore
    pynvml.nvmlInit()

    gpus = []
    count = pynvml.nvmlDeviceGetCount()

    for i in range(count):
        handle = pynvml.nvmlDeviceGetHandleByIndex(i)
        mem    = pynvml.nvmlDeviceGetMemoryInfo(handle)
        uuid   = pynvml.nvmlDeviceGetUUID(handle).decode() if isinstance(
            pynvml.nvmlDeviceGetUUID(handle), bytes
        ) else pynvml.nvmlDeviceGetUUID(handle)

        try:
            pcie_gen   = pynvml.nvmlDeviceGetMaxPcieLinkGeneration(handle)
            pcie_width = pynvml.nvmlDeviceGetMaxPcieLinkWidth(handle)
        except Exception:
            pcie_gen, pcie_width = 4, 16

        gpus.append(GpuInfo(
            uuid            = uuid,
            name            = pynvml.nvmlDeviceGetName(handle),
            vram_gb         = round(mem.total / (1024 ** 3), 1),
            driver_version  = pynvml.nvmlSystemGetDriverVersion(),
            cuda_version    = None,  # Determined later from nvcc
            total_memory_mb = mem.total // (1024 * 1024),
            pcie_link_gen   = pcie_gen,
            pcie_link_width = pcie_width,
        ))

    pynvml.nvmlShutdown()
    log.info(f"pynvml: discovered {len(gpus)} GPU(s)")
    return gpus


def _discover_via_nvidiasmi() -> list[GpuInfo]:
    result = subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=gpu_uuid,name,memory.total,driver_version",
            "--format=csv,noheader,nounits",
        ],
        capture_output=True, text=True, timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(f"nvidia-smi exit {result.returncode}: {result.stderr}")

    gpus = []
    for line in result.stdout.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 4:
            continue
        uuid, name, mem_mb_str, driver = parts[:4]
        gpus.append(GpuInfo(
            uuid            = uuid,
            name            = name,
            vram_gb         = round(int(mem_mb_str) / 1024, 1),
            driver_version  = driver,
            cuda_version    = None,
            total_memory_mb = int(mem_mb_str),
            pcie_link_gen   = 4,
            pcie_link_width = 16,
        ))

    log.info(f"nvidia-smi: discovered {len(gpus)} GPU(s)")
    return gpus


def _mock_gpus() -> list[GpuInfo]:
    """Returns a fake GPU for dev/CI environments without real hardware."""
    log.warning("Using mock GPU data — no real GPU hardware detected")
    return [
        GpuInfo(
            uuid            = "GPU-MOCK-00000000-0000-0000-0000-000000000001",
            name            = "NVIDIA Mock RTX 4090 (CI)",
            vram_gb         = 24.0,
            driver_version  = "545.23.08",
            cuda_version    = "12.3",
            total_memory_mb = 24576,
            pcie_link_gen   = 4,
            pcie_link_width = 16,
        )
    ]
