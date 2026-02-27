# @custodes/atlas

**Resource Discovery, Registry & Intelligent Routing**

Atlas is the topology brain of the stack. When a job is submitted:

- **Aedituus** decides *if* it can run
- **Atlas** decides *where* it runs

Atlas knows every GPU in the network, what it can do, who owns it, where it is, and how to route a job to the optimal node in milliseconds.

---

## Three Supply Tiers

| Tier | Source | SLA | Use Case |
|------|--------|-----|----------|
| **BACKBONE** | University/enterprise data centers | 99.9% | Production training, reserved capacity |
| **CAMPUS** | Student/lab GPUs on institutional networks | 95% | Research, coursework, mid-tier jobs |
| **EDGE** | Consumer P2P hosts | Variable | Spot inference, cost-sensitive workloads |

---

## Quick Start

```typescript
import {
  AtlasRegistryService,
  AtlasRoutingEngine,
  AtlasTopologyService,
  SupplyTier,
  GPUTier,
  RoutingStrategy,
  NetworkTopology,
} from '@custodes/atlas'

// Initialize services
const registry = new AtlasRegistryService(config, nodeStore, gpuStore, allocationStore, obsidian)
const router   = new AtlasRoutingEngine(config, nodeStore, gpuStore, allocationStore, obsidian)
const topology = new AtlasTopologyService(topologyStore)

// Register a student's GPU (called by host agent on startup)
const node = await registry.registerNode({
  host_subject_id: 'sub_student123',
  institution_id:  'mit.edu',
  campus_id:       'mit-campus-east',
  supply_tier:     SupplyTier.CAMPUS,
  topology:        NetworkTopology.WIREGUARD_MESH,
  tunnel_endpoint: 'wg.gp4u.io:51820',
  region:          'us-east-1',
  os:              'Ubuntu 24.04',
  cuda_version:    '12.3',
})

const gpu = await registry.registerGPU({
  node_id:              node.node_id,
  gpu_uuid:             'GPU-abc123-def456',
  gpu_tier:             GPUTier.RTX_4090,
  model_name:           'NVIDIA GeForce RTX 4090',
  vram_gb:              24,
  price_per_hour:       0.69,
  power_cap_watts:      250,
  allowed_workload_types: ['TRAINING', 'INFERENCE'],
})

// Route a job to the best available GPU
const decision = await router.route(
  'job_xyz789',
  'sub_researcher456',
  {
    min_vram_gb:            20,
    gpu_tiers:              [GPUTier.RTX_4090, GPUTier.A100_40],
    workload_type:          'TRAINING',
    estimated_duration_hours: 8,
    institution_id:         'mit.edu',
    preferred_tiers:        [SupplyTier.CAMPUS, SupplyTier.EDGE],
    max_price_per_hour:     1.00,
  },
  RoutingStrategy.BALANCED
)

if (decision) {
  console.log(`Routed to GPU ${decision.selected_gpu_id} on ${decision.supply_tier}`)
  // Pass decision.allocation_id to orchestration layer
}
```

---

## Routing Score Breakdown

Each candidate GPU is scored 0–100:

| Factor | Max Points | Logic |
|--------|-----------|-------|
| Supply tier preference | 25 | Backbone > Campus > Edge (per criteria) |
| Institution match | 20 | Same institution_id or campus_id |
| Node trust score | 15 | Proportional to Dextera trust score |
| Veritas verified | 10 | Benchmark-certified GPU |
| VRAM headroom | 10 | Extra VRAM beyond requested amount |
| Price competitiveness | 10 | Distance from max_price_per_hour |
| Latency | 5 | Sub-5ms = full points |
| Region preference | 5 | Preferred region match |

---

## Routing Strategies

| Strategy | Re-ranks by | Use case |
|----------|------------|---------|
| `BALANCED` | Composite score (default) | General purpose |
| `CHEAPEST` | Price per hour | Cost-sensitive jobs |
| `FASTEST` | Estimated wait time | Time-sensitive inference |
| `HIGHEST_TRUST` | Node trust score | Sensitive workloads |
| `INSTITUTIONAL` | Supply tier (backbone first) | University SLA requirements |

---

## Watchdog Processes

Two background processes must run on a cron:

```typescript
// Every 30 seconds — detect dead nodes
const { marked_offline } = await registry.runHeartbeatWatchdog()

// Every 60 seconds — expire overdue allocations
const { expired } = await registry.runAllocationWatchdog()
```

---

## Files

```
src/
├── types.ts           All types: AtlasNode, AtlasGPU, GPUAllocation, DiscoveryCriteria
├── registry-service.ts Node/GPU registration, heartbeats, watchdog processes
├── routing-engine.ts  Discovery scoring, strategy re-ranking, allocation creation
├── topology-service.ts Campus mapping, latency tracking, NVLink fabric groups
└── index.ts           Public export surface
```

---

## What agents must implement

**`AtlasNodeStore`** — PostgreSQL. Index on `status`, `institution_id`, `supply_tier`. The `findOnline()` method is called by the heartbeat watchdog every 30s — ensure it's fast.

**`AtlasGPUStore`** — PostgreSQL. The `findAvailable(criteria)` method does the heavy filtering — use DB-level WHERE clauses for VRAM, price, status, workload types. Don't pull all GPUs into memory.

**`AtlasAllocationStore`** — PostgreSQL. `findExpired()` queries for ACTIVE/RESERVED allocations where `expires_at < NOW()`.

**`TopologyStore`** — PostgreSQL or Redis. Latency measurements are time-series — TTL older readings automatically.

**Host agent integration** — The host agent (Python) calls:
1. `POST /atlas/nodes/register` on startup
2. `POST /atlas/gpus/register` for each GPU
3. `POST /atlas/nodes/:id/heartbeat` every 30s with telemetry
