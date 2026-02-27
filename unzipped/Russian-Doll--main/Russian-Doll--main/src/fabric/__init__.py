"""
Virtual Chip Fabric Layer

The fabric layer contains all the fundamental building blocks:
- Transistor: 1-bit logic kernels
- Gate: Boolean logic compositions
- Core: Functional computing units (ALU, registers)
- Die: Complete virtual chips with nesting capability
- Scheduler: Orchestration of nested dies
"""

from .transistor import (
    VirtualTransistor,
    TransistorConfig,
    TransistorType,
    TransistorArray
)

from .gate import (
    LogicGate,
    NOTGate,
    NANDGate,
    ANDGate,
    ORGate,
    XORGate,
    GateFactory,
    verify_gate_truth_table
)

from .core import (
    VirtualCore,
    CoreConfig,
    Register,
    ALU
)

from .die import (
    VirtualDie,
    DieConfig,
    SharedMemory,
    DieFactory
)

from .scheduler import (
    VirtualChipScheduler,
    Task,
    Job,
    TaskPriority,
    SchedulingPolicy
)

__all__ = [
    # Transistor
    'VirtualTransistor',
    'TransistorConfig',
    'TransistorType',
    'TransistorArray',
    # Gates
    'LogicGate',
    'NOTGate',
    'NANDGate',
    'ANDGate',
    'ORGate',
    'XORGate',
    'GateFactory',
    'verify_gate_truth_table',
    # Core
    'VirtualCore',
    'CoreConfig',
    'Register',
    'ALU',
    # Die
    'VirtualDie',
    'DieConfig',
    'SharedMemory',
    'DieFactory',
    # Scheduler
    'VirtualChipScheduler',
    'Task',
    'Job',
    'TaskPriority',
    'SchedulingPolicy'
]
