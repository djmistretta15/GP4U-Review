"""
Virtual Transistor - The Fundamental Building Block

A virtual transistor mimics the behavior of a MOSFET at the logical level:
- Binary state (0 or 1)
- Gate-controlled switching
- Propagation delay simulation
- Energy consumption modeling

Physics-inspired parameters:
- Switching time: ~1ps in modern 5nm process → simulated as delay factor
- Energy per switch: ~1fJ (femtojoule) for 5nm node
- Capacitance analog: state change resistance
"""

import time
from typing import Optional, Dict, Any
from dataclasses import dataclass, field
from enum import Enum
import numpy as np


class TransistorType(Enum):
    """Transistor types following CMOS logic"""
    NMOS = "nmos"  # N-type Metal-Oxide-Semiconductor
    PMOS = "pmos"  # P-type Metal-Oxide-Semiconductor


@dataclass
class TransistorConfig:
    """Physical and logical configuration of a virtual transistor"""
    transistor_type: TransistorType = TransistorType.NMOS
    propagation_delay_ps: float = 1.0  # picoseconds
    switching_energy_fj: float = 1.0   # femtojoules
    capacitance_analog: float = 1.0     # relative capacitance
    noise_factor: float = 0.0           # probability of bit flip (0-1)
    deterministic_seed: Optional[int] = None


class VirtualTransistor:
    """
    Minimal compute kernel representing a single transistor.

    Truth table for NMOS:
    Gate=0, Source=X → Drain=High-Z (open)
    Gate=1, Source=X → Drain=Source (closed)

    Truth table for PMOS:
    Gate=0, Source=X → Drain=Source (closed)
    Gate=1, Source=X → Drain=High-Z (open)
    """

    def __init__(self, transistor_id: str, config: TransistorConfig):
        self.id = transistor_id
        self.config = config
        self.state = 0  # Current output state
        self.gate = 0   # Gate voltage (0 or 1)
        self.source = 0 # Source input

        # Performance tracking
        self.switch_count = 0
        self.total_energy_fj = 0.0
        self.total_delay_ps = 0.0

        # Deterministic random state for noise
        self.rng = np.random.RandomState(config.deterministic_seed)

    def switch(self, gate: int, source: int) -> int:
        """
        Execute a transistor switch operation.

        Args:
            gate: Control signal (0 or 1)
            source: Input signal (0 or 1)

        Returns:
            Drain output (0, 1, or -1 for high-impedance)
        """
        # Validate inputs
        assert gate in [0, 1], f"Gate must be 0 or 1, got {gate}"
        assert source in [0, 1], f"Source must be 0 or 1, got {source}"

        # Store previous state
        prev_state = self.state

        # Apply CMOS logic
        if self.config.transistor_type == TransistorType.NMOS:
            # NMOS: conducts when gate=1
            drain = source if gate == 1 else -1
        else:
            # PMOS: conducts when gate=0
            drain = source if gate == 0 else -1

        # Apply noise if configured
        if self.config.noise_factor > 0 and drain != -1:
            if self.rng.random() < self.config.noise_factor:
                drain = 1 - drain  # Bit flip

        # Update state
        self.gate = gate
        self.source = source
        self.state = drain

        # Track energy only if state changed
        if prev_state != self.state and self.state != -1:
            self.switch_count += 1
            self.total_energy_fj += self.config.switching_energy_fj
            self.total_delay_ps += self.config.propagation_delay_ps

        return drain

    def get_metrics(self) -> Dict[str, Any]:
        """Return performance and energy metrics"""
        return {
            "transistor_id": self.id,
            "type": self.config.transistor_type.value,
            "switch_count": self.switch_count,
            "total_energy_fj": self.total_energy_fj,
            "total_delay_ps": self.total_delay_ps,
            "avg_energy_per_switch_fj": (
                self.total_energy_fj / self.switch_count
                if self.switch_count > 0 else 0
            ),
            "current_state": self.state
        }

    def reset(self):
        """Reset transistor to initial state"""
        self.state = 0
        self.gate = 0
        self.source = 0
        self.switch_count = 0
        self.total_energy_fj = 0.0
        self.total_delay_ps = 0.0

    def __repr__(self) -> str:
        return (f"VirtualTransistor(id={self.id}, type={self.config.transistor_type.value}, "
                f"state={self.state}, switches={self.switch_count})")


class TransistorArray:
    """
    Manages a collection of transistors for vectorized operations.
    Enables parallel switching across multiple transistors.
    """

    def __init__(self, size: int, config: TransistorConfig, base_seed: int = 42):
        self.size = size
        self.config = config

        # Create array of transistors with deterministic seeds
        self.transistors = [
            VirtualTransistor(
                transistor_id=f"T_{i:08d}",
                config=TransistorConfig(
                    **{**config.__dict__, 'deterministic_seed': base_seed + i}
                )
            )
            for i in range(size)
        ]

    def parallel_switch(self, gates: np.ndarray, sources: np.ndarray) -> np.ndarray:
        """
        Execute parallel switching across all transistors.

        Args:
            gates: Array of gate signals
            sources: Array of source signals

        Returns:
            Array of drain outputs
        """
        assert len(gates) == self.size, "Gates array size mismatch"
        assert len(sources) == self.size, "Sources array size mismatch"

        drains = np.array([
            t.switch(int(g), int(s))
            for t, g, s in zip(self.transistors, gates, sources)
        ])

        return drains

    def get_aggregate_metrics(self) -> Dict[str, Any]:
        """Aggregate metrics across all transistors"""
        total_switches = sum(t.switch_count for t in self.transistors)
        total_energy = sum(t.total_energy_fj for t in self.transistors)
        total_delay = sum(t.total_delay_ps for t in self.transistors)

        return {
            "array_size": self.size,
            "total_switches": total_switches,
            "total_energy_fj": total_energy,
            "total_energy_pj": total_energy / 1000,  # picojoules
            "total_energy_nj": total_energy / 1e6,   # nanojoules
            "total_delay_ps": total_delay,
            "total_delay_ns": total_delay / 1000,    # nanoseconds
            "avg_switches_per_transistor": total_switches / self.size,
            "avg_energy_per_switch_fj": total_energy / total_switches if total_switches > 0 else 0
        }

    def reset_all(self):
        """Reset all transistors in the array"""
        for t in self.transistors:
            t.reset()
