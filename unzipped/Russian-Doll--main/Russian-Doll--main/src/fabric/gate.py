"""
Virtual Logic Gates - Composed from Virtual Transistors

Implements fundamental Boolean logic gates using CMOS transistor compositions.
All gates follow standard CMOS design patterns for physical realism.

CMOS Gate Composition Theory:
- NAND gate: fundamental in CMOS (most efficient)
- All other gates can be built from NAND (functional completeness)
- Each gate has pull-up network (PMOS) and pull-down network (NMOS)

Transistor Counts (matching real CMOS):
- NOT (Inverter): 2 transistors (1 PMOS, 1 NMOS)
- NAND: 4 transistors (2 PMOS parallel, 2 NMOS series)
- NOR: 4 transistors (2 PMOS series, 2 NMOS parallel)
- AND: 6 transistors (NAND + NOT)
- OR: 6 transistors (NOR + NOT)
- XOR: 12 transistors (complex CMOS implementation)
"""

from typing import List, Dict, Any, Callable
from dataclasses import dataclass
import numpy as np

from .transistor import VirtualTransistor, TransistorConfig, TransistorType


class LogicGate:
    """Base class for all logic gates"""

    def __init__(self, gate_id: str, num_inputs: int):
        self.id = gate_id
        self.num_inputs = num_inputs
        self.transistors: List[VirtualTransistor] = []
        self.output = 0
        self.evaluation_count = 0

    def evaluate(self, *inputs: int) -> int:
        """Evaluate gate logic - to be implemented by subclasses"""
        raise NotImplementedError

    def get_metrics(self) -> Dict[str, Any]:
        """Aggregate metrics from all transistors in this gate"""
        total_switches = sum(t.switch_count for t in self.transistors)
        total_energy = sum(t.total_energy_fj for t in self.transistors)
        total_delay = sum(t.total_delay_ps for t in self.transistors)

        return {
            "gate_id": self.id,
            "gate_type": self.__class__.__name__,
            "num_transistors": len(self.transistors),
            "evaluations": self.evaluation_count,
            "total_switches": total_switches,
            "total_energy_fj": total_energy,
            "total_delay_ps": total_delay,
            "current_output": self.output
        }


class NOTGate(LogicGate):
    """
    Inverter - Most fundamental CMOS gate

    CMOS Implementation:
    - 1 PMOS (pull-up): connects VDD to output when input=0
    - 1 NMOS (pull-down): connects GND to output when input=1

    Truth Table:
    In | Out
    0  |  1
    1  |  0
    """

    def __init__(self, gate_id: str, config: TransistorConfig):
        super().__init__(gate_id, num_inputs=1)

        # Create CMOS pair
        self.pmos = VirtualTransistor(
            f"{gate_id}_PMOS",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.PMOS})
        )
        self.nmos = VirtualTransistor(
            f"{gate_id}_NMOS",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.NMOS})
        )

        self.transistors = [self.pmos, self.nmos]

    def evaluate(self, input_a: int) -> int:
        """
        Evaluate NOT gate using CMOS logic.

        When input=0: PMOS conducts (pulls output to 1), NMOS off
        When input=1: NMOS conducts (pulls output to 0), PMOS off
        """
        assert input_a in [0, 1], f"Input must be 0 or 1, got {input_a}"

        # PMOS pulls to VDD (1) when gate=0
        pmos_out = self.pmos.switch(gate=input_a, source=1)

        # NMOS pulls to GND (0) when gate=1
        nmos_out = self.nmos.switch(gate=input_a, source=0)

        # Output resolution: PMOS dominates when conducting, else NMOS
        if pmos_out != -1:
            self.output = pmos_out
        elif nmos_out != -1:
            self.output = nmos_out
        else:
            self.output = 0  # Undefined state → default to 0

        self.evaluation_count += 1
        return self.output


class NANDGate(LogicGate):
    """
    NAND Gate - Fundamental CMOS gate (most efficient)

    CMOS Implementation:
    - 2 PMOS in parallel (pull-up network)
    - 2 NMOS in series (pull-down network)

    Truth Table:
    A | B | Out
    0 | 0 |  1
    0 | 1 |  1
    1 | 0 |  1
    1 | 1 |  0
    """

    def __init__(self, gate_id: str, config: TransistorConfig):
        super().__init__(gate_id, num_inputs=2)

        # Pull-up network: parallel PMOS
        self.pmos_a = VirtualTransistor(
            f"{gate_id}_PMOS_A",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.PMOS})
        )
        self.pmos_b = VirtualTransistor(
            f"{gate_id}_PMOS_B",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.PMOS})
        )

        # Pull-down network: series NMOS
        self.nmos_a = VirtualTransistor(
            f"{gate_id}_NMOS_A",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.NMOS})
        )
        self.nmos_b = VirtualTransistor(
            f"{gate_id}_NMOS_B",
            TransistorConfig(**{**config.__dict__, 'transistor_type': TransistorType.NMOS})
        )

        self.transistors = [self.pmos_a, self.pmos_b, self.nmos_a, self.nmos_b]

    def evaluate(self, input_a: int, input_b: int) -> int:
        """Evaluate NAND using CMOS transistor network"""
        assert input_a in [0, 1] and input_b in [0, 1]

        # Pull-up: Either PMOS can pull to 1
        pmos_a_out = self.pmos_a.switch(gate=input_a, source=1)
        pmos_b_out = self.pmos_b.switch(gate=input_b, source=1)

        # Pull-down: NMOS in series (both must conduct to pull to 0)
        nmos_intermediate = self.nmos_a.switch(gate=input_a, source=0)
        if nmos_intermediate == 0:
            nmos_b_out = self.nmos_b.switch(gate=input_b, source=0)
        else:
            nmos_b_out = -1  # Series chain broken

        # Output resolution
        if pmos_a_out == 1 or pmos_b_out == 1:
            self.output = 1
        elif nmos_b_out == 0:
            self.output = 0
        else:
            self.output = 1  # Default to weak pull-up

        self.evaluation_count += 1
        return self.output


class ANDGate(LogicGate):
    """AND gate composed from NAND + NOT"""

    def __init__(self, gate_id: str, config: TransistorConfig):
        super().__init__(gate_id, num_inputs=2)
        self.nand = NANDGate(f"{gate_id}_NAND", config)
        self.not_gate = NOTGate(f"{gate_id}_NOT", config)
        self.transistors = self.nand.transistors + self.not_gate.transistors

    def evaluate(self, input_a: int, input_b: int) -> int:
        """AND = NOT(NAND(A, B))"""
        nand_out = self.nand.evaluate(input_a, input_b)
        self.output = self.not_gate.evaluate(nand_out)
        self.evaluation_count += 1
        return self.output


class ORGate(LogicGate):
    """OR gate: OR(A,B) = NAND(NOT(A), NOT(B)) - De Morgan's Law"""

    def __init__(self, gate_id: str, config: TransistorConfig):
        super().__init__(gate_id, num_inputs=2)
        self.not_a = NOTGate(f"{gate_id}_NOT_A", config)
        self.not_b = NOTGate(f"{gate_id}_NOT_B", config)
        self.nand = NANDGate(f"{gate_id}_NAND", config)
        self.transistors = (self.not_a.transistors + self.not_b.transistors +
                           self.nand.transistors)

    def evaluate(self, input_a: int, input_b: int) -> int:
        """OR using De Morgan's: OR(A,B) = NAND(NOT(A), NOT(B))"""
        not_a_out = self.not_a.evaluate(input_a)
        not_b_out = self.not_b.evaluate(input_b)
        self.output = self.nand.evaluate(not_a_out, not_b_out)
        self.evaluation_count += 1
        return self.output


class XORGate(LogicGate):
    """
    XOR gate: complex CMOS implementation
    XOR(A,B) = OR(AND(A, NOT(B)), AND(NOT(A), B))

    Truth Table:
    A | B | Out
    0 | 0 |  0
    0 | 1 |  1
    1 | 0 |  1
    1 | 1 |  0
    """

    def __init__(self, gate_id: str, config: TransistorConfig):
        super().__init__(gate_id, num_inputs=2)

        # Build from fundamental gates
        self.not_a = NOTGate(f"{gate_id}_NOT_A", config)
        self.not_b = NOTGate(f"{gate_id}_NOT_B", config)
        self.and1 = ANDGate(f"{gate_id}_AND1", config)  # A AND NOT(B)
        self.and2 = ANDGate(f"{gate_id}_AND2", config)  # NOT(A) AND B
        self.or_gate = ORGate(f"{gate_id}_OR", config)

        self.transistors = (self.not_a.transistors + self.not_b.transistors +
                           self.and1.transistors + self.and2.transistors +
                           self.or_gate.transistors)

    def evaluate(self, input_a: int, input_b: int) -> int:
        """XOR = (A AND NOT(B)) OR (NOT(A) AND B)"""
        not_a_out = self.not_a.evaluate(input_a)
        not_b_out = self.not_b.evaluate(input_b)

        and1_out = self.and1.evaluate(input_a, not_b_out)
        and2_out = self.and2.evaluate(not_a_out, input_b)

        self.output = self.or_gate.evaluate(and1_out, and2_out)
        self.evaluation_count += 1
        return self.output


class GateFactory:
    """Factory for creating logic gates with consistent configuration"""

    def __init__(self, base_config: TransistorConfig):
        self.config = base_config
        self.gate_count = 0

    def create_gate(self, gate_type: str) -> LogicGate:
        """
        Create a logic gate of specified type.

        Args:
            gate_type: One of "NOT", "NAND", "AND", "OR", "XOR"

        Returns:
            Configured LogicGate instance
        """
        gate_id = f"{gate_type}_{self.gate_count:06d}"
        self.gate_count += 1

        gate_map = {
            "NOT": NOTGate,
            "NAND": NANDGate,
            "AND": ANDGate,
            "OR": ORGate,
            "XOR": XORGate
        }

        if gate_type not in gate_map:
            raise ValueError(f"Unknown gate type: {gate_type}")

        return gate_map[gate_type](gate_id, self.config)


def verify_gate_truth_table(gate: LogicGate, expected_truth_table: Dict[tuple, int]) -> bool:
    """
    Verify a gate's behavior against expected truth table.

    Args:
        gate: Gate to verify
        expected_truth_table: Dict mapping input tuples to expected outputs

    Returns:
        True if all tests pass
    """
    for inputs, expected_output in expected_truth_table.items():
        actual_output = gate.evaluate(*inputs)
        if actual_output != expected_output:
            print(f"FAIL: {gate.id} inputs={inputs} expected={expected_output} got={actual_output}")
            return False

    print(f"PASS: {gate.id} verified against {len(expected_truth_table)} test cases")
    return True
