# Staking & Slashing — The Mnemo Engine

The Mnemo chamber manages the economic trust layer of the GP4U network. Every provider that joins puts something at risk. That risk — whether reputational or financial — is what makes their commitment credible. This document covers the complete stake and slash system.

---

## Why Staking?

Traditional cloud providers can be trusted because they are large, regulated, and contractually bound. A distributed network of university GPU clusters and commercial operators has no such guarantees by default.

Staking solves this by creating **skin in the game**. A provider with something to lose behaves differently than one with nothing at stake. The Mnemo engine ensures that misbehavior has a direct, predictable cost — and that the cost is proportional to the harm caused.

---

## Provider Tiers

### University Tier

Universities are the foundation of the GP4U provider network. They bring:
- Pre-verified identity (institutional email, .edu domain)
- Existing hardware monitoring infrastructure
- Genuine reputational risk (public slash records affect their standing)
- A mission that aligns with ours (student programs, open research)

**Stake: Zero cash required.**

The university's brand IS the stake. A slash event written permanently to the Obsidian public ledger — visible to every potential compute customer — is a stronger deterrent for a research institution than a $5,000 escrow. They cannot afford to be associated with fraud.

| Requirement | Detail |
|---|---|
| Verification | Signed MOU + verified .edu email |
| Cash stake | $0 |
| Reputational stake | All slash events public on Obsidian ledger |
| Student share | Percentage of compute revenue allocated to student programs per MOU terms |

### Commercial Tier

Commercial operators (GPU farms, gaming cafes, mining farms coming offline, individuals) post a cash stake in GP4U credits (USD-pegged at launch).

**Stake: Per-GPU pricing with volume discount.**

| GPU Count | Stake Per GPU | Total (example) | Notes |
|---|---|---|---|
| 1–4 GPUs | $50 / GPU | $50–$200 | Low barrier to entry |
| 5–16 GPUs | $35 / GPU | $175–$560 | Volume discount |
| 17+ GPUs | $25 / GPU | $425+ | Hardware audit required |

Stake is held in escrow and released when the provider exits cleanly (all jobs complete, no pending slashes, no open appeals).

---

## Slash Conditions — Complete Reference

All 13 slash conditions, organized by severity tier.

### Tier 1 — Warnings (No Stake Deduction)

Warnings are logged immutably to the Obsidian ledger but carry no financial penalty. They are tracked for pattern escalation — 3 warnings in 30 days triggers an automatic REPEATED_WARNING soft slash.

| Condition | Trigger | Appeal Window |
|---|---|---|
| `THERMAL_THROTTLE_EVENT` | GPU thermal throttle detected during a job. Hardware is real but running hot — provider should improve cooling. | None (warning only) |
| `UPTIME_DROP_MINOR` | Provider offline < 2 hours with proper job handoff. No customer harm. | None (warning only) |
| `TELEMETRY_DELAY` | Telemetry reporting delayed > 60 seconds. Likely a network blip. | None (warning only) |

### Tier 2 — Soft Slash (10–20% of Stake)

Soft slashes carry a financial penalty proportional to the provider's remaining stake. Providers have **7 days** to file an appeal.

| Condition | % of Stake | Trigger | Notes |
|---|---|---|---|
| `VRAM_OVERCLAIM` | 15% | Job consumed more VRAM than declared in manifest | Detected via Russian-Doll telemetry (`vram_used > vram_allocated`) |
| `JOB_DROPPED_UNEXPECTEDLY` | 10% | Job terminated without completing and without Tutela handshake | Customer compute was lost |
| `UPTIME_SLA_BREACH` | 10% | Provider offline > 4 hours without notice or proper handoff | SLA commitment not met |
| `HARDWARE_MISREPRESENTATION` | 20% | Detected hardware deviates > 15% from declared specs | Customers paid for capacity not delivered |
| `REPEATED_WARNING` | 10% | 3+ warnings accumulated within 30 days | Automatic escalation by the Mnemo engine |

### Tier 3 — Hard Slash (50–100% + Ejection)

Hard slashes are reserved for fundamental breaches of the trust contract. They result in full or near-full stake loss and permanent ejection from the network. Providers have **14 days** to appeal.

| Condition | % of Stake | Eject | Trigger |
|---|---|---|---|
| `TELEMETRY_TAMPERING` | 100% | Yes | Statistical analysis detected fabricated or manipulated telemetry data |
| `VISIBILITY_BLOCKED` | 100% | Yes | Provider deliberately blocked the hardware visibility layer — core T&C violation |
| `UNAUTHORIZED_PROCESS` | 75% | Yes | Processes not in the job manifest detected running alongside the customer's container |
| `CRYPTO_MINING_DURING_ML_JOB` | 100% | Yes | Mining activity detected during a declared ML/inference job — this is fraud |
| `REPEATED_SOFT_SLASH` | 50% | Yes | 3+ soft slashes — repeated violations demonstrate inability or unwillingness to meet platform standards |

---

## Auto-Escalation

The Mnemo engine automatically escalates conditions when thresholds are met — no manual admin action required:

```
3 warnings in 30 days
    → REPEATED_WARNING fires (10% soft slash)

3 soft slashes (cumulative, all time)
    → REPEATED_SOFT_SLASH fires (50% hard slash + ejection)
```

This prevents providers from gaming the system by staying just below individual thresholds.

---

## The Appeal Process

Every slash — including hard slashes — has an appeal window. The Obsidian ledger records both the slash AND the appeal resolution. The original slash is never erased, but a successful appeal adds a `SLASH_APPEAL_ACCEPTED` entry alongside it, and the stake is restored.

### How to File an Appeal

**Via the web dashboard:** Navigate to Account → Slashes → File Appeal

**Via the CLI:**
```bash
gp4u appeals file --slash-id <slash_id> --statement "your statement"
```

**Via the API:**
```
POST /api/appeals
{
  "slash_event_id": "...",
  "statement": "The VRAM reading was caused by a driver-level measurement bug. See attached nvidia-smi logs.",
  "evidence_urls": ["https://..."]
}
```

**Requirements:**
- Filed within the appeal window (7 days for soft slash, 14 days for hard slash)
- Written statement of at least 50 characters
- Optional: up to 10 supporting evidence URLs

**Rate limit:** 3 appeals per 24 hours per IP (appeals are serious, not spammable).

### What Happens During Review

1. Appeal filed → `SLASH_APPEAL_FILED` written to Obsidian
2. Provider's stake status changes to `LOCKED_APPEAL` (frozen)
3. Admin team reviews evidence
4. Admin decision: ACCEPT or REJECT

**If ACCEPTED:**
- `SLASH_APPEAL_ACCEPTED` written to Obsidian
- Slashed amount restored to stake
- Node un-suspended (if this was the sole suspension trigger)
- Original slash remains in ledger — the record is permanent

**If REJECTED:**
- `SLASH_APPEAL_REJECTED` written to Obsidian
- Stake remains slashed
- Node status unchanged

### What Cannot Be Appealed Away

- The existence of the slash record in Obsidian (immutable always)
- An accepted appeal for a HARD_SLASH does NOT reinstate an ejected node automatically — ejection reversal requires super-admin review (clearance 5)

---

## Stake Lifecycle

```
Provider Joins
    │
    ▼
ProviderStake created (ACTIVE)
    │
    ├─ Slash event (soft) → PARTIALLY_SLASHED
    │       │
    │       └─ Appeal filed → LOCKED_APPEAL
    │               │
    │               ├─ Appeal accepted → ACTIVE (stake restored)
    │               └─ Appeal rejected → PARTIALLY_SLASHED (stays)
    │
    ├─ Slash event (hard, 100%) → FULLY_SLASHED + node EJECTED
    │
    └─ Provider exits cleanly → RELEASED
```

---

## Slash Event Record Structure

Every slash event stored in the database and mirrored on the Obsidian ledger:

```typescript
{
  slash_id:        "uuid",
  node_id:         "node_...",
  condition:       "VRAM_OVERCLAIM",
  severity:        "SOFT_SLASH",
  description:     "Job consumed more VRAM than declared...",
  evidence_hash:   "sha256:abc123...",   // hash of raw evidence payload
  evidence_summary:"vram_used=25.3GB, vram_allocated=24GB at 2024-01-15T14:23:00Z",
  slash_amount:    17.25,               // dollars
  pct_of_stake:    15,
  appeal_deadline: "2024-01-22T14:23:00Z",
  issued_by:       "SYSTEM",
  ledger_block:    4821
}
```

**The evidence hash is critical:** the raw telemetry payload that triggered the slash is hashed with SHA-256. The hash is stored on-chain. If a provider challenges the evidence, investigators can produce the raw payload and verify it against the stored hash. This prevents evidence tampering in either direction.

---

## Mnemo & the Broader Chamber System

The Mnemo engine interacts with other chambers:

- **Veritas** scores provider nodes based on their slash history — a provider with a clean record routes more jobs
- **Outerim** deprioritizes providers in `SUSPENDED` or `EJECTED` states from the edge marketplace
- **Aetherion** factors reliability scores (inverse of slash frequency) into routing weights
- **Obsidian** receives every slash, appeal, and resolution as an immutable block

The chambers create a compounding effect: doing the right thing gets you more business. Doing the wrong thing reduces your routing weight, reduces your earnings, and ultimately results in ejection. This is not just punishment — it is market design.
