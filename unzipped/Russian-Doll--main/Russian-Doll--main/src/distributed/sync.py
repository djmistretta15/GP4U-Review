"""
Distributed Synchronization Layer

Handles timing coordination, clock synchronization, and state consistency
across virtual chips running on distributed physical hardware.

Physical Constraints Modeled:
- Speed of light delay: ~3.3 ns per meter in fiber
- Network latency: 0.1-100 ms depending on distance
- Clock drift: ~1 ppm (part per million) for standard oscillators
- Packet loss and reordering
"""

from typing import Dict, Any, Optional, List, Tuple
from dataclasses import dataclass, field
from enum import Enum
import time
import threading
import numpy as np


class SyncProtocol(Enum):
    """Synchronization protocols"""
    BARRIER = "barrier"              # All nodes wait at sync point
    REDUCE = "reduce"                # Aggregate results from all nodes
    BROADCAST = "broadcast"          # One node sends to all
    CONSENSUS = "consensus"          # Agreement on shared state


@dataclass
class NetworkConfig:
    """Network configuration for distributed execution"""
    speed_of_light_m_per_s: float = 299792458.0  # c in vacuum
    fiber_refractive_index: float = 1.47          # Typical optical fiber
    average_distance_meters: float = 1000.0       # Average node separation
    base_latency_ms: float = 0.1                  # Base network latency
    bandwidth_gbps: float = 100.0                 # Network bandwidth
    packet_loss_rate: float = 0.001               # 0.1% loss rate
    jitter_ms: float = 0.01                       # Network jitter

    def get_propagation_delay_ns(self) -> float:
        """Calculate one-way propagation delay in nanoseconds"""
        # Speed of light in fiber
        speed_in_fiber = self.speed_of_light_m_per_s / self.fiber_refractive_index

        # Time = Distance / Speed
        delay_seconds = self.average_distance_meters / speed_in_fiber
        return delay_seconds * 1e9  # Convert to nanoseconds

    def get_total_latency_ms(self) -> float:
        """Total network latency including propagation and processing"""
        prop_delay_ms = self.get_propagation_delay_ns() / 1e6
        return self.base_latency_ms + prop_delay_ms


@dataclass
class ClockConfig:
    """Clock and timing configuration"""
    base_frequency_hz: float = 3.0e9              # 3 GHz clock
    drift_ppm: float = 1.0                         # Clock drift (parts per million)
    deterministic_seed: int = 42


class VirtualClock:
    """
    Virtual clock with drift simulation.

    Models realistic clock behavior including:
    - Frequency drift over time
    - Temperature effects (simplified)
    - Synchronization corrections
    """

    def __init__(self, clock_id: str, config: ClockConfig):
        self.id = clock_id
        self.config = config

        # Clock state
        self.base_time = time.time()
        self.virtual_time = 0.0
        self.drift_factor = 1.0 + (config.drift_ppm / 1e6)

        # Synchronization
        self.last_sync_time = 0.0
        self.sync_offset = 0.0

        # RNG for deterministic noise
        self.rng = np.random.RandomState(config.deterministic_seed)

    def get_time(self) -> float:
        """Get current virtual time (seconds)"""
        elapsed_real = time.time() - self.base_time
        elapsed_virtual = elapsed_real * self.drift_factor
        return self.virtual_time + elapsed_virtual + self.sync_offset

    def synchronize_to(self, reference_time: float):
        """Synchronize clock to reference time"""
        current_time = self.get_time()
        self.sync_offset = reference_time - current_time
        self.last_sync_time = current_time

    def get_drift_ns(self) -> float:
        """Get current drift in nanoseconds"""
        elapsed = self.get_time() - self.last_sync_time
        drift_seconds = elapsed * (self.drift_factor - 1.0)
        return drift_seconds * 1e9


@dataclass
class SyncBarrier:
    """
    Synchronization barrier for coordinating multiple nodes.

    All nodes must reach the barrier before any can proceed.
    """
    barrier_id: str
    num_participants: int
    timeout_seconds: float = 10.0

    def __post_init__(self):
        self.arrived_count = 0
        self.lock = threading.Lock()
        self.condition = threading.Condition(self.lock)
        self.barrier_time = None

    def wait(self, node_id: str) -> bool:
        """
        Wait at barrier until all participants arrive or timeout.

        Returns: True if all arrived, False if timeout
        """
        with self.condition:
            self.arrived_count += 1

            if self.arrived_count >= self.num_participants:
                # Last to arrive - release all
                self.barrier_time = time.time()
                self.condition.notify_all()
                return True

            # Wait for others
            timeout_occurred = not self.condition.wait(timeout=self.timeout_seconds)

            if timeout_occurred:
                return False

            return True

    def reset(self):
        """Reset barrier for reuse"""
        with self.lock:
            self.arrived_count = 0
            self.barrier_time = None


class DistributedSyncManager:
    """
    Manages synchronization across distributed virtual chips.

    Handles:
    - Barrier synchronization
    - Clock synchronization
    - State consistency protocols
    - Latency compensation
    """

    def __init__(self, num_nodes: int, network_config: NetworkConfig,
                 clock_config: ClockConfig):
        self.num_nodes = num_nodes
        self.network_config = network_config
        self.clock_config = clock_config

        # Create virtual clocks for each node
        self.clocks: Dict[str, VirtualClock] = {}
        for i in range(num_nodes):
            node_id = f"NODE_{i}"
            clock = VirtualClock(
                f"CLK_{i}",
                ClockConfig(**{**clock_config.__dict__, 'deterministic_seed': clock_config.deterministic_seed + i})
            )
            self.clocks[node_id] = clock

        # Barriers
        self.barriers: Dict[str, SyncBarrier] = {}

        # Synchronization statistics
        self.sync_count = 0
        self.total_sync_latency_ms = 0.0
        self.max_clock_drift_ns = 0.0

    def create_barrier(self, barrier_id: str) -> SyncBarrier:
        """Create a new synchronization barrier"""
        barrier = SyncBarrier(
            barrier_id=barrier_id,
            num_participants=self.num_nodes
        )
        self.barriers[barrier_id] = barrier
        return barrier

    def synchronize_clocks(self) -> Dict[str, float]:
        """
        Synchronize all node clocks to reference time.

        Uses simplified Precision Time Protocol (PTP) concept.

        Returns: Dict of node_id -> drift in nanoseconds
        """
        # Reference time (master clock)
        reference_time = time.time()

        drifts = {}
        for node_id, clock in self.clocks.items():
            drift_before = clock.get_drift_ns()
            clock.synchronize_to(reference_time)
            drifts[node_id] = drift_before

            # Track max drift
            self.max_clock_drift_ns = max(self.max_clock_drift_ns, abs(drift_before))

        self.sync_count += 1
        return drifts

    def simulate_network_delay(self, data_size_bytes: int = 1024) -> float:
        """
        Simulate realistic network delay for data transfer.

        Args:
            data_size_bytes: Size of data being transmitted

        Returns: Delay in milliseconds
        """
        # Base latency
        delay_ms = self.network_config.get_total_latency_ms()

        # Transmission time (bandwidth-limited)
        bandwidth_bytes_per_ms = (self.network_config.bandwidth_gbps * 1e9 / 8) / 1000
        transmission_time_ms = data_size_bytes / bandwidth_bytes_per_ms

        # Jitter (random component)
        jitter = np.random.uniform(-self.network_config.jitter_ms,
                                   self.network_config.jitter_ms)

        total_delay = delay_ms + transmission_time_ms + jitter
        return max(0, total_delay)

    def barrier_sync(self, barrier_id: str, node_id: str) -> Tuple[bool, float]:
        """
        Perform barrier synchronization for a node.

        Returns: (success, latency_ms)
        """
        if barrier_id not in self.barriers:
            raise ValueError(f"Barrier {barrier_id} not found")

        barrier = self.barriers[barrier_id]

        start_time = time.time()
        success = barrier.wait(node_id)
        latency_ms = (time.time() - start_time) * 1000

        self.total_sync_latency_ms += latency_ms

        return success, latency_ms

    def broadcast_state(self, source_node: str, data_size_bytes: int) -> Dict[str, float]:
        """
        Simulate broadcasting state from source to all other nodes.

        Returns: Dict of node_id -> receive time (ms)
        """
        receive_times = {}

        for node_id in self.clocks.keys():
            if node_id == source_node:
                receive_times[node_id] = 0.0
            else:
                delay_ms = self.simulate_network_delay(data_size_bytes)
                receive_times[node_id] = delay_ms

        return receive_times

    def get_metrics(self) -> Dict[str, Any]:
        """Get synchronization metrics"""
        # Clock drift statistics
        current_drifts = {
            node_id: clock.get_drift_ns()
            for node_id, clock in self.clocks.items()
        }

        avg_drift_ns = np.mean(list(current_drifts.values()))
        max_current_drift_ns = np.max(list(current_drifts.values()))

        # Network metrics
        network_latency_ms = self.network_config.get_total_latency_ms()
        propagation_delay_ns = self.network_config.get_propagation_delay_ns()

        return {
            "num_nodes": self.num_nodes,
            "sync_count": self.sync_count,
            "total_sync_latency_ms": self.total_sync_latency_ms,
            "avg_sync_latency_ms": (
                self.total_sync_latency_ms / self.sync_count
                if self.sync_count > 0 else 0
            ),
            "max_clock_drift_ever_ns": self.max_clock_drift_ns,
            "avg_current_drift_ns": avg_drift_ns,
            "max_current_drift_ns": max_current_drift_ns,
            "network_latency_ms": network_latency_ms,
            "propagation_delay_ns": propagation_delay_ns,
            "network_bandwidth_gbps": self.network_config.bandwidth_gbps,
            "clock_drift_ppm": self.clock_config.drift_ppm,
            "current_node_drifts": current_drifts
        }

    def print_sync_status(self):
        """Print human-readable sync status"""
        metrics = self.get_metrics()

        print("\n" + "="*60)
        print("DISTRIBUTED SYNCHRONIZATION STATUS")
        print("="*60)
        print(f"Nodes: {metrics['num_nodes']}")
        print(f"Synchronizations: {metrics['sync_count']}")
        print(f"Avg Sync Latency: {metrics['avg_sync_latency_ms']:.3f} ms")
        print(f"Max Clock Drift: {metrics['max_clock_drift_ever_ns']:.2f} ns")
        print(f"Avg Current Drift: {metrics['avg_current_drift_ns']:.2f} ns")
        print(f"Network Latency: {metrics['network_latency_ms']:.3f} ms")
        print(f"Propagation Delay: {metrics['propagation_delay_ns']:.2f} ns")
        print("="*60 + "\n")


class ConsensusProtocol:
    """
    Simple consensus protocol for distributed state agreement.

    Implements a simplified version of Raft/Paxos for state replication.
    """

    def __init__(self, num_nodes: int):
        self.num_nodes = num_nodes
        self.quorum_size = (num_nodes // 2) + 1  # Majority
        self.consensus_count = 0

    def reach_consensus(self, proposals: Dict[str, Any]) -> Optional[Any]:
        """
        Reach consensus on a value given proposals from each node.

        Uses majority voting.

        Args:
            proposals: Dict of node_id -> proposed value

        Returns: Consensus value if reached, None otherwise
        """
        if len(proposals) < self.quorum_size:
            return None

        # Count votes for each unique value
        votes: Dict[Any, int] = {}
        for value in proposals.values():
            # Convert to hashable if needed
            hashable_value = str(value) if not isinstance(value, (int, str, float)) else value
            votes[hashable_value] = votes.get(hashable_value, 0) + 1

        # Check if any value has majority
        for value, count in votes.items():
            if count >= self.quorum_size:
                self.consensus_count += 1
                return value

        return None  # No consensus
