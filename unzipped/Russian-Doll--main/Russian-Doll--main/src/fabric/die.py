"""
Virtual Die - Complete Chip Architecture

A die represents a complete virtual chip containing:
- Multiple cores
- Shared memory/interconnect
- I/O interfaces
- Control/scheduling logic

Most importantly: A die can instantiate subordinate dies (Russian doll recursion).

Physical inspiration:
- Modern GPU die: 600mm² silicon, 80 billion transistors
- Contains ~100 SMs (Streaming Multiprocessors), each with 128 cores
- Our virtual die: configurable cores, recursive nesting capability
"""

from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import time
import uuid

from .core import VirtualCore, CoreConfig
from .transistor import TransistorConfig


@dataclass
class DieConfig:
    """Configuration for a virtual die"""
    die_id: str
    num_cores: int = 4
    register_width: int = 8
    registers_per_core: int = 8
    max_recursion_depth: int = 3      # How deep nesting can go
    current_depth: int = 0             # Current nesting level
    transistor_config: TransistorConfig = None

    def __post_init__(self):
        if self.transistor_config is None:
            self.transistor_config = TransistorConfig()


class SharedMemory:
    """
    Shared memory space accessible by all cores in a die.

    Simulates cache hierarchy and memory access patterns.
    """

    def __init__(self, memory_id: str, size_bytes: int):
        self.id = memory_id
        self.size = size_bytes
        self.data: Dict[int, int] = {}  # Address -> Value mapping

        self.read_count = 0
        self.write_count = 0
        self.access_latency_ps = 10.0  # 10 ps per access (L1 cache speed)

    def write(self, address: int, value: int) -> None:
        """Write value to memory address"""
        assert 0 <= address < self.size, f"Address {address} out of bounds"
        self.data[address] = value
        self.write_count += 1

    def read(self, address: int) -> int:
        """Read value from memory address"""
        assert 0 <= address < self.size, f"Address {address} out of bounds"
        self.read_count += 1
        return self.data.get(address, 0)

    def get_metrics(self) -> Dict[str, Any]:
        """Memory access metrics"""
        total_accesses = self.read_count + self.write_count
        total_latency_ps = total_accesses * self.access_latency_ps

        return {
            "memory_id": self.id,
            "size_bytes": self.size,
            "read_count": self.read_count,
            "write_count": self.write_count,
            "total_accesses": total_accesses,
            "total_latency_ps": total_latency_ps,
            "total_latency_ns": total_latency_ps / 1000
        }


class VirtualDie:
    """
    Complete virtual chip with cores, memory, and recursive nesting capability.

    This is the key to the "Russian doll" architecture:
    - Level 0: Physical hardware (real GPU/CPU)
    - Level 1: Virtual die simulated on Level 0
    - Level 2: Virtual die simulated within Level 1
    - ...
    - Level N: Termination at resource/latency limits
    """

    def __init__(self, config: DieConfig):
        self.config = config
        self.id = config.die_id
        self.uuid = str(uuid.uuid4())
        self.depth = config.current_depth

        # Initialize cores
        self.cores = [
            VirtualCore(
                CoreConfig(
                    core_id=f"{self.id}_C{i}",
                    num_registers=config.registers_per_core,
                    register_width=config.register_width,
                    transistor_config=config.transistor_config
                )
            )
            for i in range(config.num_cores)
        ]

        # Shared memory (1KB per core)
        self.shared_memory = SharedMemory(
            f"{self.id}_MEM",
            size_bytes=1024 * config.num_cores
        )

        # Nested dies (Russian doll children)
        self.child_dies: List['VirtualDie'] = []

        # Performance tracking
        self.total_operations = 0
        self.creation_time = time.time()
        self.active = True

    def spawn_child_die(self, child_config: Optional[DieConfig] = None) -> Optional['VirtualDie']:
        """
        Spawn a subordinate virtual die (recursive nesting).

        This is the core of the Russian doll architecture.

        Returns:
            Child die instance, or None if max depth reached
        """
        if self.depth >= self.config.max_recursion_depth:
            print(f"⚠️  Max recursion depth {self.config.max_recursion_depth} reached")
            return None

        # Create child configuration
        if child_config is None:
            child_config = DieConfig(
                die_id=f"{self.id}_CHILD_{len(self.child_dies)}",
                num_cores=max(2, self.config.num_cores // 2),  # Halve cores per level
                register_width=self.config.register_width,
                registers_per_core=self.config.registers_per_core,
                max_recursion_depth=self.config.max_recursion_depth,
                current_depth=self.depth + 1,
                transistor_config=self.config.transistor_config
            )

        child_die = VirtualDie(child_config)
        self.child_dies.append(child_die)

        print(f"✓ Spawned child die {child_die.id} at depth {child_die.depth}")
        return child_die

    def execute_on_core(self, core_index: int, opcode: str,
                       dest_reg: int, src_a: int, src_b: Optional[int] = None) -> int:
        """Execute instruction on specified core"""
        assert 0 <= core_index < len(self.cores), f"Core {core_index} out of range"

        result = self.cores[core_index].execute_instruction(opcode, dest_reg, src_a, src_b)
        self.total_operations += 1

        return result

    def broadcast_operation(self, opcode: str, dest_reg: int,
                           src_a: int, src_b: Optional[int] = None) -> List[int]:
        """
        Execute same instruction across all cores (SIMD-style).

        This mimics GPU-style parallel execution.
        """
        results = []
        for core in self.cores:
            result = core.execute_instruction(opcode, dest_reg, src_a, src_b)
            results.append(result)

        self.total_operations += len(self.cores)
        return results

    def memory_write(self, address: int, value: int) -> None:
        """Write to shared memory"""
        self.shared_memory.write(address, value)

    def memory_read(self, address: int) -> int:
        """Read from shared memory"""
        return self.shared_memory.read(address)

    def get_transistor_count(self) -> int:
        """
        Calculate total transistor count for this die.

        This recursively counts all transistors in cores and child dies.
        """
        # Count transistors in all cores
        local_count = 0
        for core in self.cores:
            for reg in core.registers:
                for gate in (reg.write_gates + reg.read_gates):
                    local_count += len(gate.transistors)

            # Count ALU transistors
            alu = core.alu
            all_gates = (alu.and_gates + alu.or_gates + alu.xor_gates + alu.not_gates +
                        alu.adder_xor1 + alu.adder_xor2 + alu.adder_and1 +
                        alu.adder_and2 + alu.adder_or)
            for gate in all_gates:
                local_count += len(gate.transistors)

        # Recursively count child dies
        child_count = sum(child.get_transistor_count() for child in self.child_dies)

        return local_count + child_count

    def get_metrics(self, recursive: bool = True) -> Dict[str, Any]:
        """
        Comprehensive metrics for the die.

        Args:
            recursive: If True, include metrics from child dies
        """
        # Core metrics
        core_metrics = [core.get_metrics() for core in self.cores]

        total_core_energy = sum(m["total_energy_fj"] for m in core_metrics)
        total_instructions = sum(m["instruction_count"] for m in core_metrics)

        # Memory metrics
        memory_metrics = self.shared_memory.get_metrics()

        # Child die metrics (recursive)
        child_metrics = []
        total_child_energy = 0.0
        if recursive and self.child_dies:
            for child in self.child_dies:
                child_metric = child.get_metrics(recursive=True)
                child_metrics.append(child_metric)
                total_child_energy += child_metric["total_energy_fj"]

        # Aggregate energy
        total_energy_fj = total_core_energy + total_child_energy

        # Compute FLOPS estimate (simplified)
        elapsed_time = time.time() - self.creation_time
        ops_per_second = self.total_operations / elapsed_time if elapsed_time > 0 else 0

        metrics = {
            "die_id": self.id,
            "uuid": self.uuid,
            "depth": self.depth,
            "num_cores": len(self.cores),
            "num_child_dies": len(self.child_dies),
            "transistor_count": self.get_transistor_count(),
            "total_instructions": total_instructions,
            "total_operations": self.total_operations,
            "ops_per_second": ops_per_second,
            "total_energy_fj": total_energy_fj,
            "total_energy_pj": total_energy_fj / 1000,
            "total_energy_nj": total_energy_fj / 1e6,
            "total_energy_uj": total_energy_fj / 1e9,  # microjoules
            "energy_per_operation_fj": (
                total_energy_fj / self.total_operations
                if self.total_operations > 0 else 0
            ),
            "elapsed_time_seconds": elapsed_time,
            "active": self.active,
            "core_metrics": core_metrics,
            "memory_metrics": memory_metrics
        }

        if recursive and child_metrics:
            metrics["child_die_metrics"] = child_metrics

        return metrics

    def shutdown(self) -> None:
        """Shutdown die and all children"""
        self.active = False
        for child in self.child_dies:
            child.shutdown()

    def get_topology_tree(self, indent: int = 0) -> str:
        """
        Generate a tree visualization of the die hierarchy.

        Example output:
        ├── DIE_0 (depth=0, cores=4, transistors=1234)
        │   ├── DIE_0_CHILD_0 (depth=1, cores=2, transistors=617)
        │   └── DIE_0_CHILD_1 (depth=1, cores=2, transistors=617)
        """
        prefix = "│   " * indent
        tree = f"{prefix}├── {self.id} (depth={self.depth}, cores={len(self.cores)}, "
        tree += f"transistors={self.get_transistor_count():,})\n"

        for child in self.child_dies:
            tree += child.get_topology_tree(indent + 1)

        return tree

    def __repr__(self) -> str:
        return (f"VirtualDie(id={self.id}, depth={self.depth}, cores={len(self.cores)}, "
                f"children={len(self.child_dies)}, transistors={self.get_transistor_count():,})")


class DieFactory:
    """Factory for creating dies with standard configurations"""

    @staticmethod
    def create_small_die(die_id: str = "SMALL_DIE") -> VirtualDie:
        """Small die: 2 cores, shallow recursion"""
        config = DieConfig(
            die_id=die_id,
            num_cores=2,
            register_width=8,
            max_recursion_depth=2
        )
        return VirtualDie(config)

    @staticmethod
    def create_medium_die(die_id: str = "MEDIUM_DIE") -> VirtualDie:
        """Medium die: 4 cores, moderate recursion"""
        config = DieConfig(
            die_id=die_id,
            num_cores=4,
            register_width=16,
            max_recursion_depth=3
        )
        return VirtualDie(config)

    @staticmethod
    def create_large_die(die_id: str = "LARGE_DIE") -> VirtualDie:
        """Large die: 8 cores, deep recursion"""
        config = DieConfig(
            die_id=die_id,
            num_cores=8,
            register_width=32,
            max_recursion_depth=4
        )
        return VirtualDie(config)

    @staticmethod
    def create_recursive_hierarchy(levels: int = 3, cores_per_level: int = 4) -> VirtualDie:
        """
        Create a fully-nested Russian doll hierarchy.

        Args:
            levels: Number of nesting levels
            cores_per_level: Cores at each level

        Returns:
            Root die with full hierarchy instantiated
        """
        root_config = DieConfig(
            die_id="ROOT",
            num_cores=cores_per_level,
            max_recursion_depth=levels,
            current_depth=0
        )

        root_die = VirtualDie(root_config)

        # Recursively spawn children
        def spawn_recursively(parent: VirtualDie, remaining_levels: int):
            if remaining_levels <= 0:
                return

            # Spawn children for this parent
            for i in range(2):  # 2 children per die
                child = parent.spawn_child_die()
                if child:
                    spawn_recursively(child, remaining_levels - 1)

        spawn_recursively(root_die, levels - 1)

        return root_die
