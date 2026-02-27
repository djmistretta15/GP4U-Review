"""
Virtual Chip Scheduler - Orchestrates Nested Dies

The scheduler manages:
1. Work distribution across cores and dies
2. Recursive execution coordination
3. Resource allocation and load balancing
4. Synchronization between nesting levels

Execution Model:
- Jobs are decomposed into tasks
- Tasks are assigned to dies based on depth and availability
- Nested dies handle sub-tasks recursively
- Results propagate back up the hierarchy
"""

from typing import List, Dict, Any, Optional, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
import time
import uuid
from queue import Queue, PriorityQueue

from .die import VirtualDie, DieConfig


class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 3
    NORMAL = 2
    HIGH = 1
    CRITICAL = 0


@dataclass
class Task:
    """A unit of work to be executed on a die"""
    task_id: str
    opcode: str
    operands: List[int]
    target_register: int
    priority: TaskPriority = TaskPriority.NORMAL
    recursion_allowed: bool = True
    assigned_die: Optional[str] = None
    assigned_core: Optional[int] = None
    result: Optional[int] = None
    execution_time_ns: float = 0.0
    energy_consumed_fj: float = 0.0
    status: str = "pending"  # pending, assigned, running, completed, failed

    def __lt__(self, other):
        """For priority queue comparison"""
        return self.priority.value < other.priority.value


@dataclass
class Job:
    """A collection of tasks representing a complete computation"""
    job_id: str
    tasks: List[Task]
    status: str = "pending"
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    total_energy_fj: float = 0.0

    def get_completion_percentage(self) -> float:
        """Calculate job completion percentage"""
        if not self.tasks:
            return 100.0
        completed = sum(1 for t in self.tasks if t.status == "completed")
        return (completed / len(self.tasks)) * 100.0

    def is_complete(self) -> bool:
        """Check if all tasks are completed"""
        return all(t.status == "completed" for t in self.tasks)

    def get_metrics(self) -> Dict[str, Any]:
        """Job-level metrics"""
        duration = (self.end_time - self.start_time) if self.end_time else 0.0

        return {
            "job_id": self.job_id,
            "num_tasks": len(self.tasks),
            "completed_tasks": sum(1 for t in self.tasks if t.status == "completed"),
            "failed_tasks": sum(1 for t in self.tasks if t.status == "failed"),
            "completion_percentage": self.get_completion_percentage(),
            "status": self.status,
            "duration_seconds": duration,
            "total_energy_fj": self.total_energy_fj,
            "total_energy_nj": self.total_energy_fj / 1e6,
            "energy_per_task_fj": self.total_energy_fj / len(self.tasks) if self.tasks else 0
        }


class SchedulingPolicy(Enum):
    """Scheduling policies for task assignment"""
    ROUND_ROBIN = "round_robin"          # Distribute tasks evenly
    LOAD_BALANCED = "load_balanced"      # Assign to least loaded core
    DEPTH_FIRST = "depth_first"          # Fill deepest dies first
    BREADTH_FIRST = "breadth_first"      # Fill shallowest dies first
    PRIORITY_BASED = "priority_based"    # Highest priority tasks first


class VirtualChipScheduler:
    """
    Scheduler for managing work across a hierarchy of virtual dies.

    The scheduler maintains:
    - Task queue (priority-based)
    - Die registry (all available dies)
    - Core allocation tracking
    - Performance metrics
    """

    def __init__(self, root_die: VirtualDie, policy: SchedulingPolicy = SchedulingPolicy.LOAD_BALANCED):
        self.root_die = root_die
        self.policy = policy

        # Build die registry (flatten hierarchy)
        self.die_registry: Dict[str, VirtualDie] = {}
        self._register_die_recursive(root_die)

        # Task management
        self.task_queue = PriorityQueue()
        self.active_tasks: Dict[str, Task] = {}
        self.completed_tasks: List[Task] = []

        # Job management
        self.jobs: Dict[str, Job] = {}

        # Core availability tracking
        self.core_availability: Dict[Tuple[str, int], bool] = {}
        self._initialize_core_tracking()

        # Performance tracking
        self.total_tasks_scheduled = 0
        self.total_tasks_completed = 0
        self.total_energy_consumed_fj = 0.0
        self.scheduler_start_time = time.time()

    def _register_die_recursive(self, die: VirtualDie):
        """Recursively register all dies in hierarchy"""
        self.die_registry[die.id] = die

        for child in die.child_dies:
            self._register_die_recursive(child)

    def _initialize_core_tracking(self):
        """Initialize core availability tracking"""
        for die_id, die in self.die_registry.items():
            for core_idx in range(len(die.cores)):
                self.core_availability[(die_id, core_idx)] = True  # Available

    def submit_job(self, job: Job) -> str:
        """
        Submit a job for execution.

        The job is decomposed into tasks and added to the queue.
        """
        job.status = "submitted"
        job.start_time = time.time()
        self.jobs[job.job_id] = job

        # Add all tasks to queue
        for task in job.tasks:
            self.task_queue.put(task)

        return job.job_id

    def create_simple_job(self, job_id: str, num_tasks: int = 10) -> Job:
        """
        Create a simple test job with ADD operations.

        Useful for benchmarking and testing.
        """
        tasks = []
        for i in range(num_tasks):
            task = Task(
                task_id=f"{job_id}_T{i}",
                opcode="ADD",
                operands=[i % 8, (i + 1) % 8],  # Use register addresses
                target_register=i % 8,
                priority=TaskPriority.NORMAL
            )
            tasks.append(task)

        return Job(job_id=job_id, tasks=tasks)

    def _select_die_and_core(self, task: Task) -> Optional[Tuple[VirtualDie, int]]:
        """
        Select optimal die and core for task execution.

        Returns: (die, core_index) or None if no resources available
        """
        available_pairs = [
            (die_id, core_idx)
            for (die_id, core_idx), available in self.core_availability.items()
            if available
        ]

        if not available_pairs:
            return None

        if self.policy == SchedulingPolicy.ROUND_ROBIN:
            # Simple round-robin selection
            selected_die_id, selected_core = available_pairs[
                self.total_tasks_scheduled % len(available_pairs)
            ]

        elif self.policy == SchedulingPolicy.LOAD_BALANCED:
            # Select die with most available cores
            die_loads = {}
            for die_id in self.die_registry:
                available_cores = sum(
                    1 for (d, c), avail in self.core_availability.items()
                    if d == die_id and avail
                )
                die_loads[die_id] = available_cores

            # Pick die with most available cores
            best_die_id = max(die_loads, key=die_loads.get)
            cores_in_die = [
                core_idx for (d, core_idx), avail in self.core_availability.items()
                if d == best_die_id and avail
            ]
            selected_die_id = best_die_id
            selected_core = cores_in_die[0] if cores_in_die else 0

        elif self.policy == SchedulingPolicy.DEPTH_FIRST:
            # Prefer deeper dies (higher depth value)
            die_depths = {
                die_id: self.die_registry[die_id].depth
                for die_id in set(d for d, c in available_pairs)
            }
            deepest_die_id = max(die_depths, key=die_depths.get)
            cores_in_die = [c for d, c in available_pairs if d == deepest_die_id]
            selected_die_id = deepest_die_id
            selected_core = cores_in_die[0]

        elif self.policy == SchedulingPolicy.BREADTH_FIRST:
            # Prefer shallower dies (lower depth value)
            die_depths = {
                die_id: self.die_registry[die_id].depth
                for die_id in set(d for d, c in available_pairs)
            }
            shallowest_die_id = min(die_depths, key=die_depths.get)
            cores_in_die = [c for d, c in available_pairs if d == shallowest_die_id]
            selected_die_id = shallowest_die_id
            selected_core = cores_in_die[0]

        else:
            # Default: first available
            selected_die_id, selected_core = available_pairs[0]

        return (self.die_registry[selected_die_id], selected_core)

    def schedule_step(self) -> int:
        """
        Execute one scheduling step: assign and execute one task.

        Returns: Number of tasks executed (0 or 1)
        """
        if self.task_queue.empty():
            return 0

        # Get highest priority task
        task = self.task_queue.get()

        # Select die and core
        assignment = self._select_die_and_core(task)
        if assignment is None:
            # No resources available, re-queue task
            self.task_queue.put(task)
            return 0

        die, core_idx = assignment

        # Mark core as busy
        self.core_availability[(die.id, core_idx)] = False
        task.assigned_die = die.id
        task.assigned_core = core_idx
        task.status = "running"
        self.active_tasks[task.task_id] = task

        # Execute task
        start_time = time.perf_counter()
        energy_before = die.cores[core_idx].get_metrics()["total_energy_fj"]

        try:
            # Load operands into registers (simplified)
            for i, operand_value in enumerate(task.operands):
                if i < len(die.cores[core_idx].registers):
                    die.cores[core_idx].registers[i].write(operand_value)

            # Execute operation
            result = die.execute_on_core(
                core_idx,
                task.opcode,
                task.target_register,
                0,  # src_a register
                1 if len(task.operands) > 1 else None  # src_b register
            )

            task.result = result
            task.status = "completed"

        except Exception as e:
            task.status = "failed"
            print(f"⚠️  Task {task.task_id} failed: {e}")

        # Measure execution
        end_time = time.perf_counter()
        energy_after = die.cores[core_idx].get_metrics()["total_energy_fj"]

        task.execution_time_ns = (end_time - start_time) * 1e9
        task.energy_consumed_fj = energy_after - energy_before

        # Update metrics
        self.total_tasks_scheduled += 1
        if task.status == "completed":
            self.total_tasks_completed += 1
            self.total_energy_consumed_fj += task.energy_consumed_fj
            self.completed_tasks.append(task)

        # Release core
        self.core_availability[(die.id, core_idx)] = True
        del self.active_tasks[task.task_id]

        # Update job status
        for job in self.jobs.values():
            if task in job.tasks:
                job.total_energy_fj += task.energy_consumed_fj
                if job.is_complete() and job.status != "completed":
                    job.status = "completed"
                    job.end_time = time.time()

        return 1

    def run_until_complete(self, max_steps: int = 10000) -> Dict[str, Any]:
        """
        Run scheduler until all tasks are complete or max_steps reached.

        Returns: Execution metrics
        """
        steps = 0
        while not self.task_queue.empty() and steps < max_steps:
            executed = self.schedule_step()
            if executed == 0:
                # No resources available, small delay
                time.sleep(0.001)
            steps += 1

        return self.get_metrics()

    def get_metrics(self) -> Dict[str, Any]:
        """Comprehensive scheduler metrics"""
        elapsed_time = time.time() - self.scheduler_start_time

        # Job metrics
        job_metrics = [job.get_metrics() for job in self.jobs.values()]

        # Die utilization
        die_utilization = {}
        for die_id, die in self.die_registry.items():
            total_cores = len(die.cores)
            busy_cores = sum(
                1 for (d, c), available in self.core_availability.items()
                if d == die_id and not available
            )
            die_utilization[die_id] = {
                "total_cores": total_cores,
                "busy_cores": busy_cores,
                "utilization_percent": (busy_cores / total_cores * 100) if total_cores > 0 else 0
            }

        return {
            "scheduler_policy": self.policy.value,
            "total_dies": len(self.die_registry),
            "total_tasks_scheduled": self.total_tasks_scheduled,
            "total_tasks_completed": self.total_tasks_completed,
            "tasks_pending": self.task_queue.qsize(),
            "tasks_active": len(self.active_tasks),
            "total_energy_consumed_fj": self.total_energy_consumed_fj,
            "total_energy_consumed_nj": self.total_energy_consumed_fj / 1e6,
            "elapsed_time_seconds": elapsed_time,
            "throughput_tasks_per_second": (
                self.total_tasks_completed / elapsed_time
                if elapsed_time > 0 else 0
            ),
            "energy_per_task_fj": (
                self.total_energy_consumed_fj / self.total_tasks_completed
                if self.total_tasks_completed > 0 else 0
            ),
            "jobs": job_metrics,
            "die_utilization": die_utilization
        }

    def print_status(self):
        """Print human-readable scheduler status"""
        metrics = self.get_metrics()

        print("\n" + "="*60)
        print("VIRTUAL CHIP SCHEDULER STATUS")
        print("="*60)
        print(f"Policy: {metrics['scheduler_policy']}")
        print(f"Total Dies: {metrics['total_dies']}")
        print(f"Tasks: {metrics['total_tasks_completed']}/{metrics['total_tasks_scheduled']} completed")
        print(f"Pending: {metrics['tasks_pending']}, Active: {metrics['tasks_active']}")
        print(f"Throughput: {metrics['throughput_tasks_per_second']:.2f} tasks/sec")
        print(f"Energy: {metrics['total_energy_consumed_nj']:.2f} nJ total, "
              f"{metrics['energy_per_task_fj']:.2f} fJ/task")
        print("="*60 + "\n")
