"""
GP4U Provider Agent
===================

The daemon that runs on a GPU provider's machine.

What it does:
  1. Discover local GPUs via nvidia-smi / CUDA
  2. Register them with the GP4U platform (Atlas)
  3. Poll for job assignments
  4. Run each job inside an isolated Docker container
  5. Stream Russian-Doll telemetry to the platform every 10s
  6. Listen for kill signals from Tutela and terminate jobs immediately
  7. Report job completion and energy usage

Security model:
  - Every job runs in a fresh Docker container with --gpus, --memory, and
    --network limits defined by the job manifest
  - The container has no access to the host filesystem beyond a read-only
    input volume and a write-only output volume
  - A watchdog thread kills the container if Tutela says to (kill_job=True)
    or if the job exceeds its declared duration
  - This agent never executes arbitrary code from the platform — it only
    passes a Docker image + env vars specified in the job manifest

Requirements:
  pip install requests psutil docker pynvml schedule

Usage:
  python -m src.agent --api-url https://gp4u.com --token <your-provider-token>
"""
