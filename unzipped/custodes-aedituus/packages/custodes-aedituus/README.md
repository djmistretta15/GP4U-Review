# @custodes/aedituus

**Policy Engine, Access Control & Rights Management**

Aedituus answers the only question that matters for every action in the stack:

> *"Is this subject allowed to do THIS SPECIFIC THING right now?"*

Not "is this user trusted?" — that's Dextera.
Not "did this happen?" — that's Obsidian.
Only: **is this action permitted under current policy?**

---

## How It Works

Rules are evaluated in **priority order** (lower number = higher priority). First matching rule wins.

```
IF subject.clearance_level >= INSTITUTIONAL
AND subject.trust_score >= 81
AND action = JOB_SUBMIT
THEN ALLOW
```

Every evaluation is logged to Obsidian — full audit trail of every access decision ever made.

---

## Quick Start

```typescript
import {
  AedituusAuthorizationService,
  AedituusAuthorizationError,
  PolicyDecision,
  ActionType,
  buildPlatformBaselinePolicy,
  buildUniversityPolicy,
} from '@custodes/aedituus'

// Initialize
const aedituus = new AedituusAuthorizationService(
  {
    instance_id: 'aedituus-primary',
    default_policy_id: 'policy_platform_baseline',
    cache_ttl_seconds: 300,
    rate_limit_configs: [
      { window_seconds: 60,   max_requests: 100, scope: 'SUBJECT' },
      { window_seconds: 3600, max_requests: 500, scope: 'SUBJECT' },
      { window_seconds: 60,   max_requests: 30,  scope: 'IP' },
    ],
  },
  myPolicyStore,    // Implement PolicyStore (PostgreSQL)
  myRateLimitStore, // Implement RateLimitStore (Redis)
  myObsidianSink    // Implement AedituusObsidianSink (wraps ObsidianEmitter)
)

// Seed default policies on startup
await policyStore.savePolicy(buildPlatformBaselinePolicy())
await policyStore.savePolicy(buildUniversityPolicy('mit.edu', 'MIT', {
  max_vram_per_student_gb: 40,
  blackout_dates: [
    { label: 'Finals Week', start: '2026-05-11T00:00:00Z', end: '2026-05-18T23:59:59Z' }
  ]
}))

// Authorize a job submission (called from GP4U job service)
try {
  const result = await aedituus.authorizeOrThrow({
    subject_id:             'sub_abc123',
    clearance_level:        ClearanceLevel.INSTITUTIONAL,
    trust_score:            85,
    subject_type:           SubjectType.STUDENT,
    institution_id:         'mit.edu',
    passport_id:            'pass_xyz',
    action:                 ActionType.JOB_SUBMIT,
    requested_vram_gb:      24,
    requested_gpu_count:    2,
    requested_duration_hours: 8,
    workload_type:          'TRAINING',
    estimated_cost:         45.00,
    ip_address:             '18.x.x.x',
  })

  // Apply constraints if ALLOW_LIMITED
  if (result.decision === PolicyDecision.ALLOW_LIMITED) {
    enforcConstraints(result.constraints)
  }
} catch (err) {
  if (err instanceof AedituusAuthorizationError) {
    // err.response.deny_reason, err.response.reason_message
    return { error: err.response.reason_message }
  }
}
```

---

## Decision Flow

```
Request arrives
  → Rate limit check (Redis, fast)
      → DENY_COOLDOWN if exceeded
  → Load policies (subject → institution → org → platform)
  → Evaluate rules in priority order
      → First match wins
      → ALLOW / ALLOW_LIMITED / DENY / STEP_UP / REVIEW
  → Log decision to Obsidian
  → Return AuthorizationResponse
```

---

## Trust Bands → Access Tiers

| Band | Score | Job Submit | VRAM | GPUs | Duration |
|------|-------|-----------|------|------|----------|
| RESTRICTED | 0–30 | Inference only | 8 GB | 1 | 2h |
| STANDARD | 31–60 | Yes | 24 GB | 2 | 24h |
| TRUSTED | 61–80 | Yes | 80 GB | 4 | 72h |
| HIGH_CLEARANCE | 81–100 | Yes | Unlimited | Unlimited | Unlimited |

---

## Files

```
src/
├── types.ts                 All types: Policy, Rule, AuthRequest, AuthResponse
├── policy-engine.ts         Rule evaluator — priority-ordered, first-match-wins
├── default-policies.ts      Platform baseline + university template policies
├── rate-limiter.ts          Token bucket rate limiting (Redis-backed)
├── authorization-service.ts Top-level service: engine + rate limiter + logging
└── index.ts                 Public export surface
```

---

## What agents must implement

**`PolicyStore`** — PostgreSQL. Policies and rules stored as JSON columns. Index on `scope` + `scope_id` + `is_active`. Cache invalidation on write.

**`RateLimitStore`** — Redis with atomic INCR + EXPIRE. Key pattern: `ratelimit:{scope}:{id}:{action}`.

**`AedituusObsidianSink`** — Thin wrapper that calls `ObsidianEmitter.policyDecision()`. Keeps Aedituus decoupled from Obsidian's full interface.

**Institution policies** — Seed one policy per university at onboarding. The `buildUniversityPolicy()` factory handles the common case. Custom rules can be added to the rules array.
