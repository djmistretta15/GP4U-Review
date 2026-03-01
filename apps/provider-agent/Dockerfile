# GP4U Provider Agent — Docker Image
# =====================================
#
# Multi-stage build:
#   Stage 1 (builder): installs dependencies
#   Stage 2 (runtime): lean image with NVIDIA CUDA base for GPU access
#
# Usage:
#   docker build -t ghcr.io/gp4u/agent:latest .
#   docker run --gpus all --rm \
#     -e GP4U_PROVIDER_TOKEN=<your_token> \
#     -e GP4U_REGION=us-east-1 \
#     ghcr.io/gp4u/agent:latest
#
# The agent requires the NVIDIA Container Toolkit on the host.
# Install: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html

# ─── Stage 1: Builder ─────────────────────────────────────────────────────────

FROM python:3.11-slim AS builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (layer cache)
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir --prefix=/install -r requirements.txt

# Copy source
COPY . .
RUN pip install --no-cache-dir --prefix=/install --no-deps .

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
# Use CUDA 12.3 base image so the agent can read GPU metrics via pynvml
# and interact with CUDA workloads if needed.
#
# Pin to specific digest in production for supply-chain security.

FROM nvidia/cuda:12.3.2-base-ubuntu22.04

# Non-root user (principle of least privilege)
RUN useradd --uid 1000 --create-home --shell /bin/sh gp4u

# Python runtime (no dev tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3.11-distutils \
    libpython3.11 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && ln -s /usr/bin/python3.11 /usr/local/bin/python3 \
    && ln -s /usr/bin/python3.11 /usr/local/bin/python

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy source code
WORKDIR /app
COPY --chown=gp4u:gp4u . .

# Switch to non-root user
USER gp4u

# ─── Health check ─────────────────────────────────────────────────────────────
# The agent writes a heartbeat file every 60s. Docker checks it to detect hangs.
HEALTHCHECK --interval=90s --timeout=10s --start-period=30s --retries=3 \
    CMD test -f /tmp/gp4u_heartbeat && test "$(( $(date +%s) - $(stat -c %Y /tmp/gp4u_heartbeat) ))" -lt 120

# ─── Labels ───────────────────────────────────────────────────────────────────
LABEL org.opencontainers.image.title="GP4U Provider Agent"
LABEL org.opencontainers.image.description="Daemon that connects GPU hardware to the GP4U marketplace"
LABEL org.opencontainers.image.source="https://github.com/gp4u/platform"
LABEL org.opencontainers.image.vendor="GP4U"

# ─── Environment defaults ─────────────────────────────────────────────────────
ENV GP4U_API_URL="https://gp4u.com"
ENV GP4U_REGION="us-east-1"
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# ─── Entry point ──────────────────────────────────────────────────────────────
ENTRYPOINT ["python", "-m", "src.agent"]
CMD ["--poll", "15"]
