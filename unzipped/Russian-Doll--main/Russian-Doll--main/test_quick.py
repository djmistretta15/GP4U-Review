#!/usr/bin/env python3
"""
Quick smoke test to verify all components work
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

print("="*60)
print("VIRTUAL CHIP - QUICK SMOKE TEST")
print("="*60)

# Test 1: Import all modules
print("\n[1/6] Testing imports...")
try:
    from fabric import (
        VirtualTransistor, TransistorConfig, TransistorType,
        NOTGate, ANDGate, XORGate,
        VirtualCore, CoreConfig,
        VirtualDie, DieConfig, DieFactory,
        VirtualChipScheduler, SchedulingPolicy
    )
    from distributed import DistributedSyncManager, NetworkConfig, ClockConfig
    from utils import calculate_energy_efficiency, calculate_statistics
    print("✓ All imports successful")
except Exception as e:
    print(f"✗ Import failed: {e}")
    sys.exit(1)

# Test 2: Virtual Transistor
print("\n[2/6] Testing virtual transistor...")
try:
    config = TransistorConfig(transistor_type=TransistorType.NMOS, deterministic_seed=42)
    t = VirtualTransistor("T1", config)
    assert t.switch(1, 1) == 1
    assert t.switch(0, 1) == -1
    print(f"✓ Transistor works (switches: {t.switch_count})")
except Exception as e:
    print(f"✗ Transistor test failed: {e}")
    sys.exit(1)

# Test 3: Logic Gates
print("\n[3/6] Testing logic gates...")
try:
    config = TransistorConfig(deterministic_seed=42)

    not_gate = NOTGate("NOT1", config)
    assert not_gate.evaluate(0) == 1
    assert not_gate.evaluate(1) == 0

    and_gate = ANDGate("AND1", config)
    assert and_gate.evaluate(1, 1) == 1
    assert and_gate.evaluate(0, 1) == 0

    print(f"✓ Gates work (NOT transistors: {len(not_gate.transistors)}, AND transistors: {len(and_gate.transistors)})")
except Exception as e:
    print(f"✗ Gate test failed: {e}")
    sys.exit(1)

# Test 4: Core and ALU
print("\n[4/6] Testing core and ALU...")
try:
    core_config = CoreConfig(
        core_id="TEST_CORE",
        register_width=8,
        transistor_config=TransistorConfig(deterministic_seed=42)
    )
    core = VirtualCore(core_config)

    core.load_immediate(0, 10)
    core.load_immediate(1, 5)
    result = core.execute_instruction("ADD", 2, 0, 1)
    assert result == 15

    metrics = core.get_metrics()
    print(f"✓ Core works (result: {result}, instructions: {metrics['instruction_count']}, energy: {metrics['total_energy_fj']:.2f} fJ)")
except Exception as e:
    print(f"✗ Core test failed: {e}")
    sys.exit(1)

# Test 5: Die with Nesting
print("\n[5/6] Testing die with recursive nesting...")
try:
    die = DieFactory.create_recursive_hierarchy(levels=3, cores_per_level=2)

    # Execute on root die
    die.cores[0].load_immediate(0, 7)
    die.cores[0].load_immediate(1, 3)
    result = die.execute_on_core(0, "ADD", 2, 0, 1)

    metrics = die.get_metrics(recursive=True)

    print(f"✓ Die works:")
    print(f"  - Depth: {die.depth}")
    print(f"  - Child dies: {len(die.child_dies)}")
    print(f"  - Total transistors: {metrics['transistor_count']:,}")
    print(f"  - Energy: {metrics['total_energy_nj']:.2f} nJ")
    print(f"  - Result: {result}")
except Exception as e:
    print(f"✗ Die test failed: {e}")
    sys.exit(1)

# Test 6: Scheduler
print("\n[6/6] Testing scheduler...")
try:
    die_config = DieConfig(
        die_id="SCHEDULER_TEST",
        num_cores=2,
        register_width=8,
        transistor_config=TransistorConfig(deterministic_seed=42)
    )
    die = VirtualDie(die_config)

    scheduler = VirtualChipScheduler(die, SchedulingPolicy.ROUND_ROBIN)
    job = scheduler.create_simple_job("TEST_JOB", num_tasks=10)
    scheduler.submit_job(job)
    scheduler.run_until_complete(max_steps=100)

    metrics = scheduler.get_metrics()

    print(f"✓ Scheduler works:")
    print(f"  - Tasks completed: {metrics['total_tasks_completed']}")
    print(f"  - Throughput: {metrics['throughput_tasks_per_second']:.2f} tasks/sec")
    print(f"  - Energy: {metrics['total_energy_consumed_nj']:.2f} nJ")
except Exception as e:
    print(f"✗ Scheduler test failed: {e}")
    sys.exit(1)

print("\n" + "="*60)
print("ALL TESTS PASSED ✓")
print("="*60)
print("\nThe Virtual Chip framework is ready to use!")
print("\nNext steps:")
print("  - Run full tests: make test")
print("  - Run experiment: make run-exp-0001")
print("  - Read docs: cat docs/paper.md")
print("="*60 + "\n")
