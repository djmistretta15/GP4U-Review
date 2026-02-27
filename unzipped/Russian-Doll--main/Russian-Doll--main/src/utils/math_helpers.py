"""
Mathematical Helper Functions

Provides calculations for:
- Energy conversions (fJ → pJ → nJ → µJ → mJ)
- Timing conversions (ps → ns → µs → ms → s)
- Statistical analysis (mean, variance, confidence intervals)
- Performance metrics (FLOPS, throughput, latency)
"""

import numpy as np
from typing import List, Tuple, Dict, Any
from scipy import stats


# Energy Conversions
def femtojoules_to_picojoules(fj: float) -> float:
    """Convert femtojoules to picojoules"""
    return fj / 1000


def femtojoules_to_nanojoules(fj: float) -> float:
    """Convert femtojoules to nanojoules"""
    return fj / 1e6


def femtojoules_to_microjoules(fj: float) -> float:
    """Convert femtojoules to microjoules"""
    return fj / 1e9


def femtojoules_to_millijoules(fj: float) -> float:
    """Convert femtojoules to millijoules"""
    return fj / 1e12


# Timing Conversions
def picoseconds_to_nanoseconds(ps: float) -> float:
    """Convert picoseconds to nanoseconds"""
    return ps / 1000


def picoseconds_to_microseconds(ps: float) -> float:
    """Convert picoseconds to microseconds"""
    return ps / 1e6


def picoseconds_to_milliseconds(ps: float) -> float:
    """Convert picoseconds to milliseconds"""
    return ps / 1e9


def picoseconds_to_seconds(ps: float) -> float:
    """Convert picoseconds to seconds"""
    return ps / 1e12


# Performance Metrics
def calculate_flops(operations: int, time_seconds: float) -> float:
    """
    Calculate FLOPS (Floating Point Operations Per Second).

    Note: For integer operations, this is technically ops/sec, not FLOPS.
    """
    if time_seconds <= 0:
        return 0.0
    return operations / time_seconds


def calculate_throughput(tasks: int, time_seconds: float) -> float:
    """Calculate throughput in tasks per second"""
    if time_seconds <= 0:
        return 0.0
    return tasks / time_seconds


def calculate_energy_efficiency(operations: int, energy_joules: float) -> float:
    """
    Calculate energy efficiency in operations per joule.

    Higher is better.
    """
    if energy_joules <= 0:
        return 0.0
    return operations / energy_joules


def calculate_power_watts(energy_joules: float, time_seconds: float) -> float:
    """Calculate average power consumption in watts"""
    if time_seconds <= 0:
        return 0.0
    return energy_joules / time_seconds


# Statistical Analysis
def calculate_statistics(values: List[float]) -> Dict[str, float]:
    """
    Calculate comprehensive statistics for a list of values.

    Returns:
        Dict with mean, median, std, min, max, variance
    """
    if not values:
        return {
            "mean": 0.0,
            "median": 0.0,
            "std": 0.0,
            "variance": 0.0,
            "min": 0.0,
            "max": 0.0,
            "count": 0
        }

    arr = np.array(values)

    return {
        "mean": float(np.mean(arr)),
        "median": float(np.median(arr)),
        "std": float(np.std(arr)),
        "variance": float(np.var(arr)),
        "min": float(np.min(arr)),
        "max": float(np.max(arr)),
        "count": len(values)
    }


def confidence_interval(values: List[float], confidence: float = 0.95) -> Tuple[float, float, float]:
    """
    Calculate confidence interval for sample mean.

    Args:
        values: List of measurements
        confidence: Confidence level (default 0.95 for 95%)

    Returns:
        (mean, lower_bound, upper_bound)
    """
    if not values:
        return (0.0, 0.0, 0.0)

    arr = np.array(values)
    mean = np.mean(arr)
    sem = stats.sem(arr)  # Standard error of mean

    interval = sem * stats.t.ppf((1 + confidence) / 2, len(arr) - 1)

    return (float(mean), float(mean - interval), float(mean + interval))


def bootstrap_confidence_interval(values: List[float], num_bootstrap: int = 10000,
                                 confidence: float = 0.95) -> Tuple[float, float, float]:
    """
    Calculate bootstrap confidence interval (more robust for non-normal distributions).

    Args:
        values: List of measurements
        num_bootstrap: Number of bootstrap samples
        confidence: Confidence level

    Returns:
        (mean, lower_bound, upper_bound)
    """
    if not values:
        return (0.0, 0.0, 0.0)

    arr = np.array(values)
    means = []

    rng = np.random.RandomState(42)  # Deterministic

    for _ in range(num_bootstrap):
        sample = rng.choice(arr, size=len(arr), replace=True)
        means.append(np.mean(sample))

    means = np.array(means)
    mean = np.mean(arr)

    alpha = 1 - confidence
    lower = np.percentile(means, alpha / 2 * 100)
    upper = np.percentile(means, (1 - alpha / 2) * 100)

    return (float(mean), float(lower), float(upper))


# Scaling Laws
def calculate_amdahl_speedup(serial_fraction: float, num_cores: int) -> float:
    """
    Calculate theoretical speedup using Amdahl's Law.

    Speedup = 1 / (serial_fraction + (1 - serial_fraction) / num_cores)

    Args:
        serial_fraction: Fraction of program that cannot be parallelized (0-1)
        num_cores: Number of parallel cores

    Returns:
        Theoretical speedup factor
    """
    if serial_fraction >= 1.0:
        return 1.0

    return 1.0 / (serial_fraction + (1 - serial_fraction) / num_cores)


def calculate_gustafson_speedup(serial_fraction: float, num_cores: int) -> float:
    """
    Calculate theoretical speedup using Gustafson's Law.

    Assumes problem size scales with number of cores.
    Speedup = serial_fraction + num_cores * (1 - serial_fraction)

    Args:
        serial_fraction: Fraction of serial work
        num_cores: Number of parallel cores

    Returns:
        Theoretical speedup factor
    """
    return serial_fraction + num_cores * (1 - serial_fraction)


def transistor_scaling_projection(current_count: int, years_forward: int,
                                  moores_law_rate: float = 2.0) -> int:
    """
    Project future transistor count using Moore's Law.

    Moore's Law: transistor count doubles every ~2 years.

    Args:
        current_count: Current transistor count
        years_forward: Years to project forward
        moores_law_rate: Years for doubling (default 2.0)

    Returns:
        Projected transistor count
    """
    doublings = years_forward / moores_law_rate
    return int(current_count * (2 ** doublings))


# Comparison Utilities
def calculate_relative_speedup(baseline_time: float, optimized_time: float) -> float:
    """Calculate relative speedup vs baseline"""
    if optimized_time <= 0:
        return float('inf')
    return baseline_time / optimized_time


def calculate_efficiency_ratio(actual_speedup: float, num_cores: int) -> float:
    """
    Calculate parallel efficiency.

    Efficiency = (Actual Speedup) / (Ideal Speedup)
    Ideal Speedup = num_cores

    Returns value between 0 and 1 (1 = perfect scaling)
    """
    ideal_speedup = num_cores
    return actual_speedup / ideal_speedup if ideal_speedup > 0 else 0.0
