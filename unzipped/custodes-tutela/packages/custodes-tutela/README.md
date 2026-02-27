# @custodes/tutela

**Runtime Protection, Threat Detection & Governance Engine**

Tutela is the immune system of the stack. It watches every running job in real time and terminates anything that violates the rules — before damage reaches the host, the campus network, or other tenants.

Every anomaly Tutela catches becomes a permanent detection rule. The threat library grows with every incident. That is the moat.

---

## Threat Categories

| Category | Examples | Default Response |
|----------|----------|-----------------|
| `CRYPTO_MINING` | Pool connections, mining patterns | KILL + BAN |
| `NETWORK_ATTACK` | Port scans, ARP scans, privilege escalation | KILL + BAN |
| `DATA_EXFILTRATION` | High outbound + idle GPU, Tor connections | KILL + SUSPEND |
| `WORKLOAD_FRAUD` | Framework mismatch, unexpected processes | KILL |
| `RESOURCE_ABUSE` | VRAM overclaim, power cap exceeded | KILL |
| `POWER_VIOLATION` | Over power cap | KILL |
| `BENCHMARK_FRAUD` | Performance inconsistency | KILL |

---

## Detection Tiers (evaluated in order, cheapest first)

```
Tier 1: Power & VRAM checks       → O(1), always run
Tier 2: Network signal checks     → O(n destinations), always run  
Tier 3: Workload pattern checks   → O(1), always run
Tier 4: Process inspection        → Most expensive, only if Tier 1-3 flagged
```

---

## Quick Start

```typescript
import {
  TutelaService,
  ThreatSeverity,
  TutelaAction,
  ComputePattern,
} from '@custodes/tutela'

// Initialize
const tutela = new TutelaService(
  {
    instance_id:                    'tutela-primary',
    signal_eval_interval_seconds:   10,
    risk_score_window_seconds:      300,
    power_grace_pct:                5,
    network_baseline_bytes_per_sec: 10_000_000,  // 10 MB/s
    crypto_pool_domains:            ['pool.minergate.com', 'xmrpool.net', ...],
    tor_exit_ips:                   [...],        // Update from Tor exit list
    enable_emergency_halt:          true,
  },
  myRuleStore,         // Implement TutelaRuleStore (PostgreSQL)
  myIncidentStore,     // Implement TutelaIncidentStore (PostgreSQL)
  myRiskStore,         // Implement TutelaRiskStore (PostgreSQL + Redis)
  myObsidianSink,      // Wraps ObsidianEmitter
  myAtlasSink,         // Wraps AtlasRegistryService
  myDexteraSink,       // Wraps DexteraPassportService.ban()
  myOrchestrationSink, // Wraps container kill/throttle commands
  myNotificationSink   // Email/Slack/webhook
)

// Seed default rules on startup
await tutela.seedDefaultRules()

// Evaluate a signal bundle (called from host agent signal processor)
const { incident, risk_score, action_taken } = await tutela.evaluateSignals(
  {
    job_id:                 'job_xyz789',
    node_id:                'node_abc',
    gpu_id:                 'gpu_001',
    subject_id:             'sub_student123',
    timestamp:              new Date().toISOString(),
    gpu_utilization_pct:    98,
    vram_used_gb:           23.5,
    vram_allocated_gb:      24,
    power_draw_watts:       310,
    power_cap_watts:        250,        // Over cap — will trigger KILL_JOB
    temperature_c:          78,
    thermal_throttling:     false,
    outbound_bytes_per_sec: 500_000,
    inbound_bytes_per_sec:  100_000,
    active_connections:     3,
    unique_dst_ips:         2,
    dns_queries_per_min:    10,
    suspicious_destinations: [],
    process_count:          4,
    unexpected_processes:   [],
    privilege_escalation_attempts: 0,
    filesystem_writes_per_sec: 100,
    declared_framework:     'pytorch',
    detected_framework:     'pytorch',
    gpu_compute_pattern:    ComputePattern.TRAINING,
  },
  'mit.edu'
)

if (action_taken) {
  console.log(`Incident: ${incident?.incident_id}`)
  console.log(`Action:   ${incident?.action_taken}`)
}

// Get risk score for Aedituus to consume
const score = await tutela.getRiskScore('job_xyz789')
// score.score = 0–100. Aedituus blocks further job submissions if > 70.
```

---

## The Incident Loop (how the moat builds)

```
1. Incident detected (e.g. new crypto mining variant)
2. Tutela fires existing rule — or UNKNOWN if no rule matches
3. Platform admin reviews incident
4. Admin calls tutela.addDetectionRule({ ... created_from_incident: incident_id })
5. New rule is versioned, stored, immediately active
6. Next variant of same attack is caught automatically
7. false_positive_count tracks if threshold needs tuning
8. tutela.tuneRule() adjusts threshold, increments rule version
9. Obsidian records which rule version caught which incident
```

Every attack teaches the system. The library is permanently encoded. Competitors start from zero. You start from everything you've seen.

---

## Risk Score → Aedituus Integration

Tutela's risk score feeds directly into Aedituus policy decisions:

```typescript
// In your job submission flow:
const risk = await tutela.getRiskScore(existing_job_id)
const auth = await aedituus.authorize({
  ...request,
  current_risk_score: risk?.score ?? 0,  // Aedituus rules can block if > threshold
})
```

Aedituus rule example:
```
IF current_risk_score > 70 THEN STEP_UP (require MFA re-auth)
IF current_risk_score > 85 THEN DENY
```

---

## Files

```
src/
├── types.ts           All types: RuntimeSignals, DetectionRule, TutelaIncident, JobRiskScore
├── detection-engine.ts 4-tier signal evaluator, risk score computation
├── response-service.ts Kill switch executor, action hierarchy, notification routing
├── default-rules.ts   19 built-in detection rules covering all threat categories
├── tutela-service.ts  Top-level orchestrator: evaluate, respond, manage rules
└── index.ts           Public export surface
```

---

## What agents must implement

**`TutelaRuleStore`** — PostgreSQL. Index on `anomaly_type` + `is_active`. The engine caches rules for 60s — cache invalidation on rule write.

**`TutelaIncidentStore`** — PostgreSQL. Index on `job_id`, `subject_id`, `node_id`, `status`.

**`TutelaRiskStore`** — Hybrid: latest risk score in Redis (TTL 60s), signal history in PostgreSQL time-series table (partition by day, retention 30 days).

**`TutelaOrchestrationSink`** — Wraps your container orchestration (Docker/K8s). `killJob()` sends SIGTERM to the container and marks the job failed. `throttleJob()` calls `nvidia-smi -pl {watts}` via the host agent.

**`TutelaNotificationSink`** — Implement `notifyInstitution()` as a webhook to the university security team endpoint (defined during institution onboarding).

**Crypto pool domain list** — Seed from a threat intel feed. Update weekly via cron. Start with top 50 known mining pools.

**Tor exit IP list** — Pull from `https://check.torproject.org/torbulkexitlist`. Update daily via cron.
