"""
Reproducibility Tests

These tests verify that all experiments are fully deterministic and reproducible.
This is CRITICAL for scientific validity - any observer running the same
experiment with the same seeds must get identical results.

Tests:
1. Deterministic transistor behavior
2. Deterministic gate evaluations
3. Deterministic core execution
4. Deterministic scheduling
5. Deterministic energy/timing measurements
"""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from fabric.transistor import VirtualTransistor, TransistorConfig, TransistorType, TransistorArray
from fabric.gate import ANDGate, XORGate
from fabric.core import VirtualCore, CoreConfig
from fabric.die import VirtualDie, DieConfig, DieFactory
from fabric.scheduler import VirtualChipScheduler, SchedulingPolicy


class TestDeterministicTransistors:
    """Verify transistor behavior is deterministic"""

    def test_same_seed_same_output(self):
        """Two transistors with same seed should behave identically"""
        config1 = TransistorConfig(
            noise_factor=0.05,
            deterministic_seed=12345
        )
        config2 = TransistorConfig(
            noise_factor=0.05,
            deterministic_seed=12345
        )

        t1 = VirtualTransistor("T1", config1)
        t2 = VirtualTransistor("T2", config2)

        # Execute identical operations
        results1 = [t1.switch(1, i % 2) for i in range(100)]
        results2 = [t2.switch(1, i % 2) for i in range(100)]

        assert results1 == results2

    def test_different_seed_different_output(self):
        """Different seeds should produce different behavior (with noise)"""
        config1 = TransistorConfig(
            noise_factor=0.1,
            deterministic_seed=11111
        )
        config2 = TransistorConfig(
            noise_factor=0.1,
            deterministic_seed=22222
        )

        t1 = VirtualTransistor("T1", config1)
        t2 = VirtualTransistor("T2", config2)

        results1 = [t1.switch(1, 1) for _ in range(100)]
        results2 = [t2.switch(1, 1) for _ in range(100)]

        # With noise, different seeds should produce different results
        # (This test might rarely fail due to chance, but extremely unlikely with 100 samples)
        assert results1 != results2

    def test_multiple_runs_same_result(self):
        """Multiple runs with same seed should give identical results"""
        def run_experiment(seed):
            config = TransistorConfig(
                noise_factor=0.05,
                deterministic_seed=seed
            )
            t = VirtualTransistor("T", config)

            results = []
            for i in range(50):
                results.append(t.switch(i % 2, i % 2))

            return results, t.get_metrics()

        # Run experiment 3 times with same seed
        results1, metrics1 = run_experiment(99999)
        results2, metrics2 = run_experiment(99999)
        results3, metrics3 = run_experiment(99999)

        # All should be identical
        assert results1 == results2 == results3
        assert metrics1["switch_count"] == metrics2["switch_count"] == metrics3["switch_count"]
        assert metrics1["total_energy_fj"] == metrics2["total_energy_fj"] == metrics3["total_energy_fj"]


class TestDeterministicGates:
    """Verify gate behavior is deterministic"""

    def test_gate_evaluation_reproducibility(self):
        """Gates with same seed should produce identical results"""
        def evaluate_gate_sequence(seed):
            config = TransistorConfig(deterministic_seed=seed)
            gate = XORGate("XOR", config)

            results = []
            for i in range(20):
                a = (i >> 1) & 1
                b = i & 1
                results.append(gate.evaluate(a, b))

            return results, gate.get_metrics()

        results1, metrics1 = evaluate_gate_sequence(54321)
        results2, metrics2 = evaluate_gate_sequence(54321)

        assert results1 == results2
        assert metrics1["evaluations"] == metrics2["evaluations"]
        assert metrics1["total_energy_fj"] == metrics2["total_energy_fj"]


class TestDeterministicCore:
    """Verify core execution is deterministic"""

    def test_core_instruction_sequence(self):
        """Same instruction sequence should produce same results"""
        def run_core_program(seed):
            config = CoreConfig(
                core_id="CORE",
                register_width=8,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            core = VirtualCore(config)

            # Execute program
            core.load_immediate(0, 10)
            core.load_immediate(1, 5)

            result1 = core.execute_instruction("ADD", 2, 0, 1)  # 10 + 5 = 15
            result2 = core.execute_instruction("SUB", 3, 2, 1)  # 15 - 5 = 10
            result3 = core.execute_instruction("XOR", 4, 2, 3)  # 15 ^ 10 = 5

            metrics = core.get_metrics()

            return [result1, result2, result3], metrics

        # Run twice with same seed
        results1, metrics1 = run_core_program(777)
        results2, metrics2 = run_core_program(777)

        assert results1 == results2
        assert metrics1["instruction_count"] == metrics2["instruction_count"]
        assert metrics1["total_energy_fj"] == metrics2["total_energy_fj"]


class TestDeterministicDie:
    """Verify die behavior is deterministic"""

    def test_die_execution_reproducibility(self):
        """Die execution should be reproducible"""
        def run_die_test(seed):
            config = DieConfig(
                die_id="DIE",
                num_cores=2,
                register_width=8,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            die = VirtualDie(config)

            # Execute operations
            die.cores[0].load_immediate(0, 7)
            die.cores[0].load_immediate(1, 3)

            result1 = die.execute_on_core(0, "ADD", 2, 0, 1)

            die.cores[1].load_immediate(0, 12)
            die.cores[1].load_immediate(1, 8)

            result2 = die.execute_on_core(1, "SUB", 2, 0, 1)

            metrics = die.get_metrics(recursive=False)

            return [result1, result2], metrics

        results1, metrics1 = run_die_test(888)
        results2, metrics2 = run_die_test(888)

        assert results1 == results2
        assert metrics1["total_instructions"] == metrics2["total_instructions"]

    def test_nested_die_reproducibility(self):
        """Nested die hierarchies should be reproducible"""
        def create_hierarchy(seed):
            config = DieConfig(
                die_id="ROOT",
                num_cores=4,
                max_recursion_depth=3,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            root = VirtualDie(config)

            # Create hierarchy
            child1 = root.spawn_child_die()
            child2 = root.spawn_child_die()

            if child1:
                grandchild = child1.spawn_child_die()

            transistor_count = root.get_transistor_count()
            num_children = len(root.child_dies)

            return transistor_count, num_children

        count1, children1 = create_hierarchy(1234)
        count2, children2 = create_hierarchy(1234)

        assert count1 == count2
        assert children1 == children2


class TestDeterministicScheduler:
    """Verify scheduler behavior is deterministic"""

    def test_scheduler_task_execution(self):
        """Scheduler should execute tasks deterministically"""
        def run_scheduler_test(seed):
            config = DieConfig(
                die_id="ROOT",
                num_cores=2,
                register_width=8,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            die = VirtualDie(config)

            scheduler = VirtualChipScheduler(die, SchedulingPolicy.ROUND_ROBIN)

            # Create and submit job
            job = scheduler.create_simple_job("JOB_1", num_tasks=10)
            scheduler.submit_job(job)

            # Run to completion
            metrics = scheduler.run_until_complete(max_steps=100)

            return metrics

        metrics1 = run_scheduler_test(5555)
        metrics2 = run_scheduler_test(5555)

        assert metrics1["total_tasks_completed"] == metrics2["total_tasks_completed"]
        assert metrics1["total_energy_consumed_fj"] == metrics2["total_energy_consumed_fj"]


class TestCrossRunConsistency:
    """Test consistency across multiple full runs"""

    def test_end_to_end_reproducibility(self):
        """Complete end-to-end test of reproducibility"""
        def full_experiment(seed):
            # Create die
            config = DieConfig(
                die_id="EXPERIMENT",
                num_cores=4,
                register_width=16,
                max_recursion_depth=2,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            root = VirtualDie(config)

            # Spawn children
            child1 = root.spawn_child_die()
            child2 = root.spawn_child_die()

            # Create scheduler
            scheduler = VirtualChipScheduler(root, SchedulingPolicy.LOAD_BALANCED)

            # Run jobs
            job1 = scheduler.create_simple_job("JOB_A", num_tasks=20)
            job2 = scheduler.create_simple_job("JOB_B", num_tasks=20)

            scheduler.submit_job(job1)
            scheduler.submit_job(job2)

            scheduler.run_until_complete(max_steps=200)

            # Collect comprehensive metrics
            die_metrics = root.get_metrics(recursive=True)
            sched_metrics = scheduler.get_metrics()

            return {
                "transistor_count": die_metrics["transistor_count"],
                "total_instructions": die_metrics["total_instructions"],
                "total_energy_fj": die_metrics["total_energy_fj"],
                "tasks_completed": sched_metrics["total_tasks_completed"],
                "scheduler_energy_fj": sched_metrics["total_energy_consumed_fj"]
            }

        # Run experiment 3 times
        result1 = full_experiment(2024)
        result2 = full_experiment(2024)
        result3 = full_experiment(2024)

        # All results should be identical
        assert result1 == result2 == result3

        # Print results for verification
        print("\nReproducibility Test Results:")
        print(f"  Transistor Count: {result1['transistor_count']}")
        print(f"  Total Instructions: {result1['total_instructions']}")
        print(f"  Total Energy (fJ): {result1['total_energy_fj']:.2f}")
        print(f"  Tasks Completed: {result1['tasks_completed']}")

    def test_hash_based_verification(self):
        """Use hashing to verify reproducibility"""
        import hashlib
        import json

        def compute_experiment_hash(seed):
            config = DieConfig(
                die_id="HASH_TEST",
                num_cores=2,
                transistor_config=TransistorConfig(deterministic_seed=seed)
            )
            die = VirtualDie(config)

            # Execute operations
            for core in die.cores:
                core.load_immediate(0, 42)
                core.load_immediate(1, 17)
                core.execute_instruction("ADD", 2, 0, 1)
                core.execute_instruction("XOR", 3, 0, 1)

            metrics = die.get_metrics(recursive=False)

            # Extract only deterministic fields (exclude timing)
            deterministic_metrics = {
                'transistor_count': metrics['transistor_count'],
                'total_instructions': metrics['total_instructions'],
                'total_operations': metrics['total_operations'],
                'total_energy_fj': metrics['total_energy_fj'],
                'energy_per_operation_fj': metrics['energy_per_operation_fj']
            }

            # Create deterministic hash
            hash_input = json.dumps(deterministic_metrics, sort_keys=True)
            return hashlib.sha256(hash_input.encode()).hexdigest()

        # Same seed should produce same hash (reproducibility)
        hash1 = compute_experiment_hash(9999)
        hash2 = compute_experiment_hash(9999)

        assert hash1 == hash2, "Same seed must produce identical results"

        # Third run with same seed should also match
        hash3 = compute_experiment_hash(9999)
        assert hash1 == hash3, "Reproducibility must hold across multiple runs"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
