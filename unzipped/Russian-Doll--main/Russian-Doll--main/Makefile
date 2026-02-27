# Virtual Chip Makefile
# Provides convenient commands for development, testing, and experimentation

.PHONY: help install test test-verbose test-reproducibility clean \
        experiment run-exp-0001 docker-build docker-test docker-run \
        format lint type-check quality docs

# Default target
help:
	@echo "Virtual Chip - Russian Doll Architecture"
	@echo ""
	@echo "Available targets:"
	@echo "  make install              - Install dependencies"
	@echo "  make test                 - Run all tests"
	@echo "  make test-verbose         - Run tests with verbose output"
	@echo "  make test-reproducibility - Run reproducibility tests only"
	@echo "  make experiment           - Run all experiments"
	@echo "  make run-exp-0001         - Run experiment 0001"
	@echo "  make docker-build         - Build Docker image"
	@echo "  make docker-test          - Run tests in Docker"
	@echo "  make docker-run           - Interactive Docker shell"
	@echo "  make format               - Format code with black and isort"
	@echo "  make lint                 - Run flake8 linter"
	@echo "  make type-check           - Run mypy type checker"
	@echo "  make quality              - Run all code quality checks"
	@echo "  make clean                - Remove generated files"
	@echo ""

# Installation
install:
	pip install -r requirements.txt

# Testing
test:
	pytest src/tests/ -v --tb=short

test-verbose:
	pytest src/tests/ -vv --tb=long

test-reproducibility:
	pytest src/tests/test_reproducibility.py -v

test-coverage:
	pytest src/tests/ --cov=src --cov-report=html --cov-report=term

# Experiments
experiment: run-exp-0001

run-exp-0001:
	@echo "Running Experiment 0001: Virtual Chip Scaling Efficiency"
	python experiments/exp_0001/run_experiment.py

# Docker operations
docker-build:
	docker build -t virtual-chip .

docker-test:
	docker run virtual-chip pytest src/tests/ -v

docker-run:
	docker run -it virtual-chip /bin/bash

docker-experiment:
	docker run virtual-chip python experiments/exp_0001/run_experiment.py

# Code quality
format:
	black src/ experiments/
	isort src/ experiments/

lint:
	flake8 src/ experiments/ --max-line-length=100 --ignore=E203,W503

type-check:
	mypy src/ --ignore-missing-imports

quality: format lint type-check
	@echo "✓ All quality checks passed"

# Documentation
docs:
	@echo "Generating documentation..."
	@echo "See docs/paper.md for theoretical whitepaper"

# Cleanup
clean:
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	rm -rf htmlcov/ .coverage
	@echo "✓ Cleaned generated files"

# Reproducibility verification
verify-reproducibility:
	@echo "Verifying reproducibility across 3 runs..."
	pytest src/tests/test_reproducibility.py::TestCrossRunConsistency::test_end_to_end_reproducibility -v

# Quick demo
demo:
	@echo "Running quick demo..."
	python -c "from src.fabric import DieFactory; \
	           die = DieFactory.create_recursive_hierarchy(levels=3, cores_per_level=2); \
	           print(die.get_topology_tree()); \
	           metrics = die.get_metrics(); \
	           print(f'\nTransistors: {metrics[\"transistor_count\"]:,}'); \
	           print(f'Total Energy: {metrics[\"total_energy_nj\"]:.2f} nJ')"

.DEFAULT_GOAL := help
