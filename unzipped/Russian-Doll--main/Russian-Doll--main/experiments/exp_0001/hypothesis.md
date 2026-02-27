# Experiment 0001: Virtual Chip Scaling Efficiency

## Hypothesis

**Null Hypothesis (H₀):** The energy efficiency (operations per joule) of nested virtual chips
scales linearly with the number of cores, regardless of nesting depth.

**Alternative Hypothesis (H₁):** Energy efficiency exhibits sub-linear scaling with increased
nesting depth due to coordination overhead, with efficiency degradation proportional to
depth × number of cores.

**Mathematical Formulation:**

Let:
- `E(n, d)` = Energy efficiency (ops/J) for `n` cores at depth `d`
- `α` = Scaling coefficient
- `β` = Depth penalty coefficient

H₀: `E(n, d) = α × n` (linear, depth-independent)

H₁: `E(n, d) = α × n / (1 + β × d)` (sub-linear with depth penalty)

## Rationale

Virtual chip architectures introduce coordination overhead at each nesting level:
1. **Communication latency** between parent and child dies
2. **Synchronization costs** across hierarchical levels
3. **Memory coherence** maintenance across virtual boundaries

We expect these overheads to manifest as reduced energy efficiency at deeper nesting levels.

## Experimental Design

### Independent Variables
- Number of cores per die: [2, 4, 8]
- Nesting depth: [0, 1, 2, 3]
- Scheduling policy: ROUND_ROBIN, LOAD_BALANCED

### Dependent Variables
- Energy efficiency (ops/joule)
- Throughput (tasks/second)
- Total energy consumption (nJ)
- Average latency per task (ns)

### Control Variables
- Register width: 8 bits
- Task type: ADD operations
- Number of tasks: 100 per run
- Transistor configuration: deterministic seed = 42
- Propagation delay: 1.0 ps per transistor
- Switching energy: 1.0 fJ per transistor

### Repetitions
- 10 runs per configuration
- Total configurations: 3 (cores) × 4 (depths) × 2 (policies) = 24
- Total runs: 24 × 10 = 240

## Success Criteria

The alternative hypothesis (H₁) is supported if:
1. Linear regression shows significant negative coefficient for depth (p < 0.05)
2. Energy efficiency decreases by ≥10% for each depth level
3. Confidence intervals for different depths do not overlap

## Predictions

Based on coordination overhead theory:
- Depth 0: ~100% efficiency (baseline)
- Depth 1: ~85-90% efficiency (-10-15%)
- Depth 2: ~70-80% efficiency (-20-30%)
- Depth 3: ~60-70% efficiency (-30-40%)

## References

- Amdahl, G. M. (1967). "Validity of the single processor approach to achieving large scale computing capabilities"
- Gustafson, J. L. (1988). "Reevaluating Amdahl's law"
- Flynn, M. J. (1972). "Some computer organizations and their effectiveness"
