#!/usr/bin/env python3
"""
Experiment 0001 Runner: Virtual Chip Scaling Efficiency

This script executes the complete experimental protocol:
1. Load configuration
2. Generate experimental conditions
3. Execute trials with full reproducibility
4. Collect and analyze data
5. Generate statistical reports
6. Export results in multiple formats

All results are deterministic and reproducible.
"""

import sys
import json
import yaml
import time
from pathlib import Path
from typing import Dict, List, Any
import numpy as np
import pandas as pd

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

from fabric import (
    VirtualDie, DieConfig, VirtualChipScheduler,
    SchedulingPolicy, TransistorConfig
)
from utils.math_helpers import (
    calculate_energy_efficiency,
    calculate_statistics,
    bootstrap_confidence_interval
)


class ExperimentRunner:
    """Manages experiment execution following scientific method"""

    def __init__(self, config_path: str):
        self.config_path = Path(config_path)
        self.exp_dir = self.config_path.parent

        # Load configuration
        with open(config_path, 'r') as f:
            self.config = yaml.safe_load(f)

        self.results = []
        self.start_time = None
        self.end_time = None

    def generate_conditions(self) -> List[Dict[str, Any]]:
        """
        Generate all experimental conditions (factorial design).

        Returns: List of condition dictionaries
        """
        conditions = []

        for num_cores in self.config['independent_variables']['num_cores']:
            for depth in self.config['independent_variables']['nesting_depth']:
                for policy_str in self.config['independent_variables']['scheduling_policy']:
                    for rep in range(self.config['repetitions']):
                        condition = {
                            'num_cores': num_cores,
                            'nesting_depth': depth,
                            'scheduling_policy': policy_str,
                            'repetition': rep,
                            # Deterministic seed unique to this condition
                            'seed': self.config['experiment']['deterministic_seed'] + (
                                num_cores * 1000 + depth * 100 + rep
                            )
                        }
                        conditions.append(condition)

        return conditions

    def run_single_trial(self, condition: Dict[str, Any]) -> Dict[str, Any]:
        """
        Execute a single experimental trial.

        Args:
            condition: Experimental condition parameters

        Returns:
            Trial results with all measurements
        """
        # Extract parameters
        num_cores = condition['num_cores']
        depth = condition['nesting_depth']
        policy_str = condition['scheduling_policy']
        seed = condition['seed']

        # Create transistor config
        trans_config = TransistorConfig(
            propagation_delay_ps=self.config['control_variables']['transistor_config']['propagation_delay_ps'],
            switching_energy_fj=self.config['control_variables']['transistor_config']['switching_energy_fj'],
            noise_factor=self.config['control_variables']['transistor_config']['noise_factor'],
            deterministic_seed=seed
        )

        # Create root die
        die_config = DieConfig(
            die_id=f"DIE_C{num_cores}_D{depth}",
            num_cores=num_cores,
            register_width=self.config['control_variables']['register_width'],
            registers_per_core=self.config['control_variables']['registers_per_core'],
            max_recursion_depth=depth,
            current_depth=0,
            transistor_config=trans_config
        )

        root_die = VirtualDie(die_config)

        # Spawn nested hierarchy if depth > 0
        if depth > 0:
            self._spawn_hierarchy(root_die, depth)

        # Create scheduler
        policy = SchedulingPolicy[policy_str]
        scheduler = VirtualChipScheduler(root_die, policy)

        # Create and submit job
        num_tasks = self.config['control_variables']['num_tasks_per_run']
        job = scheduler.create_simple_job(f"JOB_{seed}", num_tasks=num_tasks)

        trial_start = time.perf_counter()
        scheduler.submit_job(job)

        # Run to completion
        scheduler.run_until_complete(max_steps=num_tasks * 10)

        trial_end = time.perf_counter()
        trial_duration = trial_end - trial_start

        # Collect metrics
        die_metrics = root_die.get_metrics(recursive=True)
        sched_metrics = scheduler.get_metrics()

        # Calculate derived metrics
        total_ops = die_metrics['total_operations']
        total_energy_j = die_metrics['total_energy_nj'] / 1e9  # Convert nJ to J

        energy_efficiency = calculate_energy_efficiency(total_ops, total_energy_j)

        # Compile results
        result = {
            # Condition
            'num_cores': num_cores,
            'nesting_depth': depth,
            'scheduling_policy': policy_str,
            'repetition': condition['repetition'],
            'seed': seed,
            # Measurements
            'transistor_count': die_metrics['transistor_count'],
            'total_operations': total_ops,
            'total_instructions': die_metrics['total_instructions'],
            'total_energy_fj': die_metrics['total_energy_fj'],
            'total_energy_nj': die_metrics['total_energy_nj'],
            'total_energy_j': total_energy_j,
            'energy_per_operation_fj': die_metrics['energy_per_operation_fj'],
            'energy_efficiency_ops_per_joule': energy_efficiency,
            'throughput_ops_per_second': die_metrics['ops_per_second'],
            'throughput_tasks_per_second': sched_metrics['throughput_tasks_per_second'],
            'tasks_completed': sched_metrics['total_tasks_completed'],
            'trial_duration_seconds': trial_duration,
            'num_child_dies': die_metrics['num_child_dies']
        }

        return result

    def _spawn_hierarchy(self, root_die: VirtualDie, max_depth: int):
        """Recursively spawn child dies to create hierarchy"""
        def spawn_recursive(parent: VirtualDie, remaining_depth: int):
            if remaining_depth <= 0:
                return

            # Spawn 2 children per parent
            for _ in range(2):
                child = parent.spawn_child_die()
                if child and remaining_depth > 1:
                    spawn_recursive(child, remaining_depth - 1)

        spawn_recursive(root_die, max_depth)

    def run_all_trials(self):
        """Execute all experimental trials"""
        conditions = self.generate_conditions()
        total_trials = len(conditions)

        print(f"\n{'='*70}")
        print(f"EXPERIMENT: {self.config['experiment']['name']}")
        print(f"{'='*70}")
        print(f"Total trials to execute: {total_trials}")
        print(f"Configuration: {self.config_path}")
        print(f"{'='*70}\n")

        self.start_time = time.time()

        for i, condition in enumerate(conditions, 1):
            print(f"[{i}/{total_trials}] Running: cores={condition['num_cores']}, "
                  f"depth={condition['nesting_depth']}, "
                  f"policy={condition['scheduling_policy']}, "
                  f"rep={condition['repetition']}...", end=" ")

            try:
                result = self.run_single_trial(condition)
                self.results.append(result)
                print(f"✓ (energy_eff={result['energy_efficiency_ops_per_joule']:.2e} ops/J)")

            except Exception as e:
                print(f"✗ FAILED: {e}")
                # Log error but continue
                result = condition.copy()
                result['error'] = str(e)
                self.results.append(result)

        self.end_time = time.time()

    def analyze_results(self) -> Dict[str, Any]:
        """Perform statistical analysis on results"""
        df = pd.DataFrame(self.results)

        # Filter out failed trials
        df_valid = df[~df['energy_efficiency_ops_per_joule'].isna()].copy()

        analysis = {
            'summary_statistics': {},
            'by_condition': {},
            'hypothesis_test': {}
        }

        # Overall summary
        for metric in self.config['dependent_variables']:
            if metric in df_valid.columns:
                analysis['summary_statistics'][metric] = calculate_statistics(
                    df_valid[metric].tolist()
                )

        # Group by conditions
        for num_cores in self.config['independent_variables']['num_cores']:
            for depth in self.config['independent_variables']['nesting_depth']:
                for policy in self.config['independent_variables']['scheduling_policy']:
                    condition_key = f"cores_{num_cores}_depth_{depth}_{policy}"

                    subset = df_valid[
                        (df_valid['num_cores'] == num_cores) &
                        (df_valid['nesting_depth'] == depth) &
                        (df_valid['scheduling_policy'] == policy)
                    ]

                    if len(subset) > 0:
                        condition_analysis = {}

                        # Energy efficiency with confidence intervals
                        eff_values = subset['energy_efficiency_ops_per_joule'].tolist()

                        if self.config['statistical_analysis']['use_bootstrap']:
                            mean, lower, upper = bootstrap_confidence_interval(
                                eff_values,
                                num_bootstrap=self.config['statistical_analysis']['bootstrap_samples'],
                                confidence=self.config['statistical_analysis']['confidence_level']
                            )
                        else:
                            from utils.math_helpers import confidence_interval
                            mean, lower, upper = confidence_interval(
                                eff_values,
                                confidence=self.config['statistical_analysis']['confidence_level']
                            )

                        condition_analysis['energy_efficiency'] = {
                            'mean': mean,
                            'ci_lower': lower,
                            'ci_upper': upper,
                            'n': len(eff_values)
                        }

                        # Throughput
                        throughput_values = subset['throughput_tasks_per_second'].tolist()
                        condition_analysis['throughput'] = calculate_statistics(throughput_values)

                        analysis['by_condition'][condition_key] = condition_analysis

        return analysis

    def generate_report(self, analysis: Dict[str, Any]):
        """Generate markdown report"""
        report_path = self.exp_dir / self.config['output']['report_file']

        with open(report_path, 'w') as f:
            f.write(f"# {self.config['experiment']['name']}\n\n")
            f.write(f"**Experiment ID:** {self.config['experiment']['id']}\n\n")
            f.write(f"**Date:** {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
            f.write(f"**Duration:** {self.end_time - self.start_time:.2f} seconds\n\n")

            f.write("## Experimental Design\n\n")
            f.write(f"- **Independent Variables:** "
                   f"{', '.join(self.config['independent_variables'].keys())}\n")
            f.write(f"- **Repetitions:** {self.config['repetitions']}\n")
            f.write(f"- **Total Trials:** {len(self.results)}\n\n")

            f.write("## Summary Statistics\n\n")
            for metric, stats in analysis['summary_statistics'].items():
                f.write(f"### {metric}\n\n")
                f.write(f"- Mean: {stats['mean']:.4e}\n")
                f.write(f"- Median: {stats['median']:.4e}\n")
                f.write(f"- Std Dev: {stats['std']:.4e}\n")
                f.write(f"- Range: [{stats['min']:.4e}, {stats['max']:.4e}]\n\n")

            f.write("## Results by Condition\n\n")
            f.write("| Cores | Depth | Policy | Energy Eff (ops/J) | 95% CI | Throughput (tasks/s) |\n")
            f.write("|-------|-------|--------|-------------------|--------|---------------------|\n")

            for condition_key, data in analysis['by_condition'].items():
                parts = condition_key.split('_')
                cores = parts[1]
                depth = parts[3]
                policy = parts[4]

                eff = data['energy_efficiency']
                thr = data['throughput']

                f.write(f"| {cores} | {depth} | {policy} | "
                       f"{eff['mean']:.2e} | "
                       f"[{eff['ci_lower']:.2e}, {eff['ci_upper']:.2e}] | "
                       f"{thr['mean']:.2f} |\n")

            f.write("\n## Reproducibility\n\n")
            f.write(f"- Deterministic seed: {self.config['experiment']['deterministic_seed']}\n")
            f.write(f"- Configuration: `{self.config_path.name}`\n")
            f.write(f"- All trials are fully reproducible by re-running with same seed\n\n")

        print(f"\n✓ Report generated: {report_path}")

    def save_results(self):
        """Save results to JSON and CSV"""
        # JSON
        json_path = self.exp_dir / self.config['output']['results_file']
        with open(json_path, 'w') as f:
            json.dump({
                'experiment': self.config['experiment'],
                'results': self.results,
                'execution_time': self.end_time - self.start_time
            }, f, indent=2)

        print(f"✓ Results saved: {json_path}")

        # CSV
        csv_path = self.exp_dir / self.config['output']['raw_data_file']
        df = pd.DataFrame(self.results)
        df.to_csv(csv_path, index=False)

        print(f"✓ Raw data saved: {csv_path}")

    def run(self):
        """Execute complete experimental protocol"""
        self.run_all_trials()
        analysis = self.analyze_results()
        self.generate_report(analysis)
        self.save_results()

        print(f"\n{'='*70}")
        print("EXPERIMENT COMPLETE")
        print(f"{'='*70}\n")


if __name__ == "__main__":
    config_file = Path(__file__).parent / "config.yaml"
    runner = ExperimentRunner(config_file)
    runner.run()
