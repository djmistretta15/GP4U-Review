"""
Logic Verification Tests

Tests the correctness of:
1. Transistor switching logic
2. Gate truth tables
3. Core ALU operations
4. Die execution

All tests must be deterministic and reproducible.
"""

import pytest
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fabric.transistor import VirtualTransistor, TransistorConfig, TransistorType
from fabric.gate import (
    NOTGate, NANDGate, ANDGate, ORGate, XORGate,
    GateFactory, verify_gate_truth_table
)
from fabric.core import VirtualCore, CoreConfig
from fabric.die import VirtualDie, DieConfig


class TestTransistorLogic:
    """Test virtual transistor switching behavior"""

    def test_nmos_truth_table(self):
        """NMOS: conducts when gate=1"""
        config = TransistorConfig(transistor_type=TransistorType.NMOS, deterministic_seed=42)
        t = VirtualTransistor("T_NMOS", config)

        # Gate=0 → High-Z (open)
        assert t.switch(0, 0) == -1
        assert t.switch(0, 1) == -1

        # Gate=1 → Conducts (closed)
        assert t.switch(1, 0) == 0
        assert t.switch(1, 1) == 1

    def test_pmos_truth_table(self):
        """PMOS: conducts when gate=0"""
        config = TransistorConfig(transistor_type=TransistorType.PMOS, deterministic_seed=42)
        t = VirtualTransistor("T_PMOS", config)

        # Gate=0 → Conducts (closed)
        assert t.switch(0, 0) == 0
        assert t.switch(0, 1) == 1

        # Gate=1 → High-Z (open)
        assert t.switch(1, 0) == -1
        assert t.switch(1, 1) == -1

    def test_energy_tracking(self):
        """Verify energy consumption is tracked"""
        config = TransistorConfig(switching_energy_fj=1.0, deterministic_seed=42)
        t = VirtualTransistor("T_ENERGY", config)

        # Initial state
        assert t.total_energy_fj == 0.0

        # Perform switches
        t.switch(1, 1)
        t.switch(1, 0)
        t.switch(0, 1)

        # Energy should be tracked
        assert t.total_energy_fj > 0.0
        assert t.switch_count > 0

    def test_deterministic_behavior(self):
        """Verify deterministic behavior with same seed"""
        config1 = TransistorConfig(noise_factor=0.1, deterministic_seed=42)
        config2 = TransistorConfig(noise_factor=0.1, deterministic_seed=42)

        t1 = VirtualTransistor("T1", config1)
        t2 = VirtualTransistor("T2", config2)

        # Same inputs should produce same outputs
        for _ in range(100):
            out1 = t1.switch(1, 1)
            out2 = t2.switch(1, 1)
            assert out1 == out2


class TestGateLogic:
    """Test logic gate truth tables"""

    def test_not_gate(self):
        """Verify NOT gate truth table"""
        config = TransistorConfig(deterministic_seed=42)
        gate = NOTGate("NOT_TEST", config)

        assert gate.evaluate(0) == 1
        assert gate.evaluate(1) == 0

    def test_nand_gate(self):
        """Verify NAND gate truth table"""
        config = TransistorConfig(deterministic_seed=42)
        gate = NANDGate("NAND_TEST", config)

        assert gate.evaluate(0, 0) == 1
        assert gate.evaluate(0, 1) == 1
        assert gate.evaluate(1, 0) == 1
        assert gate.evaluate(1, 1) == 0

    def test_and_gate(self):
        """Verify AND gate truth table"""
        config = TransistorConfig(deterministic_seed=42)
        gate = ANDGate("AND_TEST", config)

        assert gate.evaluate(0, 0) == 0
        assert gate.evaluate(0, 1) == 0
        assert gate.evaluate(1, 0) == 0
        assert gate.evaluate(1, 1) == 1

    def test_or_gate(self):
        """Verify OR gate truth table"""
        config = TransistorConfig(deterministic_seed=42)
        gate = ORGate("OR_TEST", config)

        assert gate.evaluate(0, 0) == 0
        assert gate.evaluate(0, 1) == 1
        assert gate.evaluate(1, 0) == 1
        assert gate.evaluate(1, 1) == 1

    def test_xor_gate(self):
        """Verify XOR gate truth table"""
        config = TransistorConfig(deterministic_seed=42)
        gate = XORGate("XOR_TEST", config)

        assert gate.evaluate(0, 0) == 0
        assert gate.evaluate(0, 1) == 1
        assert gate.evaluate(1, 0) == 1
        assert gate.evaluate(1, 1) == 0

    def test_gate_energy_tracking(self):
        """Verify gates track energy from transistors"""
        config = TransistorConfig(switching_energy_fj=1.0, deterministic_seed=42)
        gate = ANDGate("ENERGY_TEST", config)

        gate.evaluate(1, 1)
        gate.evaluate(0, 1)

        metrics = gate.get_metrics()
        assert metrics["total_energy_fj"] > 0
        assert metrics["num_transistors"] == 6  # AND = NAND + NOT

    def test_functional_completeness(self):
        """Verify all gates can be built from NAND (functional completeness)"""
        config = TransistorConfig(deterministic_seed=42)

        # NOT from NAND: NOT(A) = NAND(A, A)
        nand = NANDGate("NAND_NOT", config)
        assert nand.evaluate(0, 0) == 1  # NOT(0) = 1
        assert nand.evaluate(1, 1) == 0  # NOT(1) = 0


class TestCoreALU:
    """Test core ALU operations"""

    def test_8bit_addition(self):
        """Test 8-bit addition"""
        config = CoreConfig(
            core_id="TEST_CORE",
            register_width=8,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        core = VirtualCore(config)

        # Load values into registers
        core.load_immediate(0, 5)
        core.load_immediate(1, 3)

        # Execute ADD
        result = core.execute_instruction("ADD", 2, 0, 1)

        assert result == 8
        assert core.registers[2].read() == 8

    def test_8bit_subtraction(self):
        """Test 8-bit subtraction"""
        config = CoreConfig(
            core_id="TEST_CORE",
            register_width=8,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        core = VirtualCore(config)

        core.load_immediate(0, 10)
        core.load_immediate(1, 3)

        result = core.execute_instruction("SUB", 2, 0, 1)

        assert result == 7
        assert core.registers[2].read() == 7

    def test_bitwise_operations(self):
        """Test bitwise AND, OR, XOR"""
        config = CoreConfig(
            core_id="TEST_CORE",
            register_width=8,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        core = VirtualCore(config)

        # Test AND: 0b1100 & 0b1010 = 0b1000 (12 & 10 = 8)
        core.load_immediate(0, 12)
        core.load_immediate(1, 10)
        assert core.execute_instruction("AND", 2, 0, 1) == 8

        # Test OR: 0b1100 | 0b1010 = 0b1110 (12 | 10 = 14)
        assert core.execute_instruction("OR", 2, 0, 1) == 14

        # Test XOR: 0b1100 ^ 0b1010 = 0b0110 (12 ^ 10 = 6)
        assert core.execute_instruction("XOR", 2, 0, 1) == 6

    def test_overflow_handling(self):
        """Test that overflow is properly masked"""
        config = CoreConfig(
            core_id="TEST_CORE",
            register_width=8,  # 8-bit = 0-255
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        core = VirtualCore(config)

        # 255 + 5 = 260, should wrap to 4 (masked to 8 bits)
        core.load_immediate(0, 255)
        core.load_immediate(1, 5)

        result = core.execute_instruction("ADD", 2, 0, 1)

        # Result should be masked to 8 bits: 260 & 0xFF = 4
        assert result == 4


class TestDieExecution:
    """Test complete die execution"""

    def test_die_creation(self):
        """Test basic die creation"""
        config = DieConfig(
            die_id="TEST_DIE",
            num_cores=2,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        assert len(die.cores) == 2
        assert die.depth == 0
        assert die.active is True

    def test_single_core_execution(self):
        """Test executing on a single core"""
        config = DieConfig(
            die_id="TEST_DIE",
            num_cores=2,
            register_width=8,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        # Load values
        die.cores[0].load_immediate(0, 7)
        die.cores[0].load_immediate(1, 3)

        # Execute
        result = die.execute_on_core(0, "ADD", 2, 0, 1)

        assert result == 10

    def test_broadcast_execution(self):
        """Test SIMD-style broadcast across all cores"""
        config = DieConfig(
            die_id="TEST_DIE",
            num_cores=4,
            register_width=8,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        # Load same values into all cores
        for core in die.cores:
            core.load_immediate(0, 5)
            core.load_immediate(1, 3)

        # Broadcast ADD across all cores
        results = die.broadcast_operation("ADD", 2, 0, 1)

        # All results should be 8
        assert all(r == 8 for r in results)
        assert len(results) == 4

    def test_shared_memory(self):
        """Test shared memory access"""
        config = DieConfig(
            die_id="TEST_DIE",
            num_cores=2,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        # Write to memory
        die.memory_write(100, 42)

        # Read from memory
        value = die.memory_read(100)

        assert value == 42

    def test_transistor_counting(self):
        """Test transistor count calculation"""
        config = DieConfig(
            die_id="TEST_DIE",
            num_cores=1,
            registers_per_core=2,
            register_width=4,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        count = die.get_transistor_count()

        # Should have some transistors (exact count depends on gate compositions)
        assert count > 0


class TestNesting:
    """Test Russian doll nesting"""

    def test_single_child_spawn(self):
        """Test spawning one child die"""
        config = DieConfig(
            die_id="PARENT",
            num_cores=4,
            max_recursion_depth=2,
            current_depth=0,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        parent = VirtualDie(config)

        child = parent.spawn_child_die()

        assert child is not None
        assert child.depth == 1
        assert len(parent.child_dies) == 1
        assert child.config.num_cores == 2  # Halved

    def test_recursion_depth_limit(self):
        """Test that max recursion depth is enforced"""
        config = DieConfig(
            die_id="ROOT",
            num_cores=4,
            max_recursion_depth=2,
            current_depth=2,  # Already at max
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        die = VirtualDie(config)

        child = die.spawn_child_die()

        # Should not be able to spawn child at max depth
        assert child is None

    def test_multi_level_nesting(self):
        """Test creating multi-level hierarchy"""
        config = DieConfig(
            die_id="L0",
            num_cores=8,
            max_recursion_depth=3,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        root = VirtualDie(config)

        # Level 1
        child1 = root.spawn_child_die()
        assert child1.depth == 1

        # Level 2
        child2 = child1.spawn_child_die()
        assert child2.depth == 2

        # Level 3 (should succeed - max depth 3 allows depths 0, 1, 2, 3)
        child3 = child2.spawn_child_die()
        assert child3 is not None
        assert child3.depth == 3

        # Level 4 (should fail - exceeds max depth)
        child4 = child3.spawn_child_die()
        assert child4 is None

    def test_recursive_transistor_counting(self):
        """Test transistor counting across hierarchy"""
        config = DieConfig(
            die_id="ROOT",
            num_cores=2,
            max_recursion_depth=2,
            transistor_config=TransistorConfig(deterministic_seed=42)
        )
        root = VirtualDie(config)

        # Count before spawning
        count_before = root.get_transistor_count()

        # Spawn child
        child = root.spawn_child_die()

        # Count after spawning
        count_after = root.get_transistor_count()

        # Count should increase
        assert count_after > count_before


if __name__ == "__main__":
    # Run tests with pytest
    pytest.main([__file__, "-v", "--tb=short"])
