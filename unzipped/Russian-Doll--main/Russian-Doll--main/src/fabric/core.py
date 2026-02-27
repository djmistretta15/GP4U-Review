"""
Virtual Core - Functional Computing Units

A core represents a collection of gates organized into functional blocks:
- Arithmetic Logic Unit (ALU)
- Registers (state storage)
- Control logic
- Interconnect network

Inspired by modern CPU/GPU cores but simplified to essential operations.
Each core can execute parallel operations on its functional units.
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import numpy as np

from .gate import LogicGate, GateFactory, ANDGate, ORGate, XORGate, NOTGate
from .transistor import TransistorConfig


@dataclass
class CoreConfig:
    """Configuration for a virtual core"""
    core_id: str
    num_registers: int = 8           # Number of internal registers
    register_width: int = 8          # Bits per register
    alu_operations: List[str] = None # Supported ALU operations
    transistor_config: TransistorConfig = None

    def __post_init__(self):
        if self.alu_operations is None:
            self.alu_operations = ["ADD", "SUB", "AND", "OR", "XOR", "NOT"]
        if self.transistor_config is None:
            self.transistor_config = TransistorConfig()


class Register:
    """
    N-bit register implemented with logic gates.

    A register is a storage element made of flip-flops (gate compositions).
    For simplicity, we model it as a stateful array with gate-based read/write.
    """

    def __init__(self, register_id: str, width: int, gate_factory: GateFactory):
        self.id = register_id
        self.width = width
        self.value = 0  # Stored value as integer
        self.gate_factory = gate_factory

        # Each bit has associated control gates
        self.write_gates = [gate_factory.create_gate("AND") for _ in range(width)]
        self.read_gates = [gate_factory.create_gate("AND") for _ in range(width)]

        self.read_count = 0
        self.write_count = 0

    def write(self, value: int) -> None:
        """Write a value to the register"""
        assert 0 <= value < (1 << self.width), f"Value {value} exceeds {self.width}-bit width"

        # Simulate gate switching for write operation
        bits = [(value >> i) & 1 for i in range(self.width)]
        for i, (bit, gate) in enumerate(zip(bits, self.write_gates)):
            gate.evaluate(bit, 1)  # Write enable = 1

        self.value = value
        self.write_count += 1

    def read(self) -> int:
        """Read value from the register"""
        # Simulate gate switching for read operation
        bits = [(self.value >> i) & 1 for i in range(self.width)]
        for bit, gate in zip(bits, self.read_gates):
            gate.evaluate(bit, 1)  # Read enable = 1

        self.read_count += 1
        return self.value

    def get_metrics(self) -> Dict[str, Any]:
        """Return register metrics"""
        total_energy = sum(
            sum(t.total_energy_fj for t in gate.transistors)
            for gate in (self.write_gates + self.read_gates)
        )

        return {
            "register_id": self.id,
            "width": self.width,
            "current_value": self.value,
            "read_count": self.read_count,
            "write_count": self.write_count,
            "total_energy_fj": total_energy
        }


class ALU:
    """
    Arithmetic Logic Unit - Performs computational operations.

    Implements fundamental operations using gate compositions:
    - ADD: Full adder chains (XOR + AND gates)
    - AND, OR, XOR: Direct gate operations
    - NOT: Inverter operations
    - SUB: Addition with two's complement
    """

    def __init__(self, alu_id: str, width: int, gate_factory: GateFactory):
        self.id = alu_id
        self.width = width
        self.gate_factory = gate_factory

        # Pre-allocate gates for common operations
        self.and_gates = [gate_factory.create_gate("AND") for _ in range(width)]
        self.or_gates = [gate_factory.create_gate("OR") for _ in range(width)]
        self.xor_gates = [gate_factory.create_gate("XOR") for _ in range(width)]
        self.not_gates = [gate_factory.create_gate("NOT") for _ in range(width)]

        # Full adder components for each bit
        self.adder_xor1 = [gate_factory.create_gate("XOR") for _ in range(width)]
        self.adder_xor2 = [gate_factory.create_gate("XOR") for _ in range(width)]
        self.adder_and1 = [gate_factory.create_gate("AND") for _ in range(width)]
        self.adder_and2 = [gate_factory.create_gate("AND") for _ in range(width)]
        self.adder_or = [gate_factory.create_gate("OR") for _ in range(width)]

        self.operation_count = 0
        self.last_operation = None

    def bitwise_and(self, a: int, b: int) -> int:
        """Bitwise AND operation"""
        result = 0
        for i in range(self.width):
            bit_a = (a >> i) & 1
            bit_b = (b >> i) & 1
            result |= (self.and_gates[i].evaluate(bit_a, bit_b) << i)

        self.operation_count += 1
        self.last_operation = "AND"
        return result

    def bitwise_or(self, a: int, b: int) -> int:
        """Bitwise OR operation"""
        result = 0
        for i in range(self.width):
            bit_a = (a >> i) & 1
            bit_b = (b >> i) & 1
            result |= (self.or_gates[i].evaluate(bit_a, bit_b) << i)

        self.operation_count += 1
        self.last_operation = "OR"
        return result

    def bitwise_xor(self, a: int, b: int) -> int:
        """Bitwise XOR operation"""
        result = 0
        for i in range(self.width):
            bit_a = (a >> i) & 1
            bit_b = (b >> i) & 1
            result |= (self.xor_gates[i].evaluate(bit_a, bit_b) << i)

        self.operation_count += 1
        self.last_operation = "XOR"
        return result

    def bitwise_not(self, a: int) -> int:
        """Bitwise NOT operation"""
        result = 0
        for i in range(self.width):
            bit_a = (a >> i) & 1
            result |= (self.not_gates[i].evaluate(bit_a) << i)

        self.operation_count += 1
        self.last_operation = "NOT"
        return result & ((1 << self.width) - 1)  # Mask to width

    def add(self, a: int, b: int) -> int:
        """
        Addition using ripple-carry adder logic.

        Full adder truth table for each bit:
        Sum = A XOR B XOR Carry_in
        Carry_out = (A AND B) OR (Carry_in AND (A XOR B))
        """
        result = 0
        carry = 0

        for i in range(self.width):
            bit_a = (a >> i) & 1
            bit_b = (b >> i) & 1

            # Sum = A XOR B XOR Carry
            xor1 = self.adder_xor1[i].evaluate(bit_a, bit_b)
            sum_bit = self.adder_xor2[i].evaluate(xor1, carry)

            # Carry = (A AND B) OR (Carry AND (A XOR B))
            and1 = self.adder_and1[i].evaluate(bit_a, bit_b)
            and2 = self.adder_and2[i].evaluate(carry, xor1)
            carry = self.adder_or[i].evaluate(and1, and2)

            result |= (sum_bit << i)

        self.operation_count += 1
        self.last_operation = "ADD"
        return result & ((1 << self.width) - 1)  # Mask overflow

    def subtract(self, a: int, b: int) -> int:
        """Subtraction using two's complement: A - B = A + (~B + 1)"""
        b_complement = self.bitwise_not(b)
        result = self.add(a, b_complement)
        result = self.add(result, 1)  # Add 1 for two's complement

        self.operation_count += 1  # Only count the subtract, not internal ops
        self.last_operation = "SUB"
        return result & ((1 << self.width) - 1)

    def get_metrics(self) -> Dict[str, Any]:
        """Aggregate ALU metrics"""
        all_gates = (self.and_gates + self.or_gates + self.xor_gates + self.not_gates +
                    self.adder_xor1 + self.adder_xor2 + self.adder_and1 +
                    self.adder_and2 + self.adder_or)

        total_energy = sum(
            sum(t.total_energy_fj for t in gate.transistors)
            for gate in all_gates
        )

        total_delay = sum(
            sum(t.total_delay_ps for t in gate.transistors)
            for gate in all_gates
        )

        return {
            "alu_id": self.id,
            "width": self.width,
            "operation_count": self.operation_count,
            "last_operation": self.last_operation,
            "total_energy_fj": total_energy,
            "total_delay_ps": total_delay,
            "num_gates": len(all_gates)
        }


class VirtualCore:
    """
    A complete virtual core with registers, ALU, and control logic.

    Executes simple instruction sequences and tracks all resource usage.
    """

    def __init__(self, config: CoreConfig):
        self.config = config
        self.gate_factory = GateFactory(config.transistor_config)

        # Initialize functional units
        self.registers = [
            Register(f"{config.core_id}_R{i}", config.register_width, self.gate_factory)
            for i in range(config.num_registers)
        ]

        self.alu = ALU(f"{config.core_id}_ALU", config.register_width, self.gate_factory)

        self.instruction_count = 0
        self.cycle_count = 0

    def execute_instruction(self, opcode: str, dest_reg: int,
                           src_reg_a: int, src_reg_b: Optional[int] = None) -> int:
        """
        Execute a single instruction.

        Format: OPCODE dest, src_a, src_b

        Returns: Result value
        """
        # Read source operands
        operand_a = self.registers[src_reg_a].read()
        operand_b = self.registers[src_reg_b].read() if src_reg_b is not None else 0

        # Execute operation
        if opcode == "ADD":
            result = self.alu.add(operand_a, operand_b)
        elif opcode == "SUB":
            result = self.alu.subtract(operand_a, operand_b)
        elif opcode == "AND":
            result = self.alu.bitwise_and(operand_a, operand_b)
        elif opcode == "OR":
            result = self.alu.bitwise_or(operand_a, operand_b)
        elif opcode == "XOR":
            result = self.alu.bitwise_xor(operand_a, operand_b)
        elif opcode == "NOT":
            result = self.alu.bitwise_not(operand_a)
        elif opcode == "MOV":
            result = operand_a  # Move operation
        else:
            raise ValueError(f"Unknown opcode: {opcode}")

        # Write result to destination register
        self.registers[dest_reg].write(result)

        self.instruction_count += 1
        self.cycle_count += 1  # Simplified: 1 cycle per instruction

        return result

    def load_immediate(self, reg: int, value: int) -> None:
        """Load immediate value into register"""
        self.registers[reg].write(value)
        self.cycle_count += 1

    def get_metrics(self) -> Dict[str, Any]:
        """Comprehensive core metrics"""
        register_metrics = [r.get_metrics() for r in self.registers]
        alu_metrics = self.alu.get_metrics()

        total_energy = (
            sum(m["total_energy_fj"] for m in register_metrics) +
            alu_metrics["total_energy_fj"]
        )

        return {
            "core_id": self.config.core_id,
            "instruction_count": self.instruction_count,
            "cycle_count": self.cycle_count,
            "total_energy_fj": total_energy,
            "total_energy_pj": total_energy / 1000,
            "total_energy_nj": total_energy / 1e6,
            "energy_per_instruction_fj": total_energy / self.instruction_count if self.instruction_count > 0 else 0,
            "alu_metrics": alu_metrics,
            "register_metrics": register_metrics
        }

    def reset(self) -> None:
        """Reset core to initial state"""
        for reg in self.registers:
            reg.write(0)
        self.instruction_count = 0
        self.cycle_count = 0
