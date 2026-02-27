"""
Distributed Computing Layer

Handles synchronization, timing, and coordination across
virtual chips running on distributed physical hardware.
"""

from .sync import (
    DistributedSyncManager,
    VirtualClock,
    NetworkConfig,
    ClockConfig,
    SyncBarrier,
    SyncProtocol,
    ConsensusProtocol
)

__all__ = [
    'DistributedSyncManager',
    'VirtualClock',
    'NetworkConfig',
    'ClockConfig',
    'SyncBarrier',
    'SyncProtocol',
    'ConsensusProtocol'
]
