# Virtual Chip - Reproducible Execution Environment
#
# This Dockerfile creates a fully reproducible environment for running
# virtual chip experiments. All dependencies are pinned to specific versions.

FROM python:3.10-slim

# Set working directory
WORKDIR /workspace

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY experiments/ ./experiments/
COPY benchmarks/ ./benchmarks/
COPY docs/ ./docs/

# Copy infrastructure files
COPY Makefile .
COPY README.md .

# Set Python path
ENV PYTHONPATH=/workspace/src:$PYTHONPATH

# Default command: run tests
CMD ["pytest", "src/tests/", "-v"]

# Build instructions:
#   docker build -t virtual-chip .
#
# Run tests:
#   docker run virtual-chip
#
# Run experiment:
#   docker run virtual-chip python experiments/exp_0001/run_experiment.py
#
# Interactive shell:
#   docker run -it virtual-chip /bin/bash
