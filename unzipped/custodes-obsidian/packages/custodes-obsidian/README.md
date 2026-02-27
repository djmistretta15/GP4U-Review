# @custodes/obsidian

**Tamper-Proof Audit Ledger, Evidence Vault & Dispute Resolution**

Obsidian is the memory of the entire stack. Every event — auth, job lifecycle, policy decision, security anomaly, billing transaction — flows through Obsidian and becomes a permanent, cryptographically verifiable record.

Universities, enterprises, and regulators don't just want compute. They need to prove what happened. Obsidian is what makes that possible.

---

## How the Chain Works

Each entry is linked to the previous one via SHA-256 hashing:

```
entry[0].block_hash = SHA256(payload_hash + GENESIS_HASH + 0)
entry[1].block_hash = SHA256(payload_hash + entry[0].block_hash + 1)
entry[N].block_hash = SHA256(payload_hash + entry[N-1].block_hash + N)
```

Tamper with any entry → its block_hash changes → all subsequent entries become invalid. Detection is a simple sequential scan.

Every 100 entries are sealed into a **signed Merkle Block**. Any single entry can be verified against the Merkle root without downloading the full ledger.

---

## Quick Start

```typescript
import {
  ObsidianLedgerService,
  ObsidianEmitter,
  LedgerEventType,
} from '@custodes/obsidian'

// Initialize
const ledger = new ObsidianLedgerService(
  {
    instance_id: 'obsidian-primary',
    private_key_pem: process.env.OBSIDIAN_PRIVATE_KEY!,
    public_key_pem: process.env.OBSIDIAN_PUBLIC_KEY!,
    merkle_block_size: 100,
    retention_days: 2555,  // 7 years for compliance
  },
  myLedgerStore,    // Implement LedgerStore (PostgreSQL append-only table)
  mySequenceCounter // Implement SequenceCounter (Redis INCR)
)

const emitter = new ObsidianEmitter(ledger)

// Emit a job start event (called from GP4U job service)
await emitter.jobStarted({
  subject_id:      'sub_abc123',
  job_id:          'job_xyz789',
  gpu_id:          'gpu_001',
  container_id:    'container_aaa',
  power_cap_watts: 250,
})

// Verify chain integrity (for audits)
const result = await ledger.verifyChainRange({ from_block: 0, to_block: 999 })
console.log(result.valid) // true if untampered

// Generate evidence package for a dispute
const evidence = await ledger.generateEvidencePackage('JOB', 'job_xyz789')
// evidence.signature proves this package came from Obsidian
// evidence.merkle_proofs let you verify each entry independently
```

---

## Integration Points

| Pillar / Chamber | What it emits |
|---|---|
| **Dextera** | authSuccess, authFailed, subjectBanned, passportIssued |
| **Atlas** | gpuRegistered, allocationCreated, allocationReleased |
| **Aedituus** | policyAllow, policyDeny, policyStepUp |
| **Tutela** | anomalyDetected, threatFlagged, killSwitchFired |
| **GP4U** | jobSubmitted, jobStarted, jobCompleted, jobFailed |
| **Veritas** | benchmarkRun, benchmarkFailed |
| **Outerim** | tunnelOpened, tunnelClosed |
| **Billing** | chargeCreated, chargeSettled, refundIssued |

---

## Dispute Flow

```
1. Job fails → either party calls ledger.openDispute(job_id, ...)
2. Obsidian automatically collects all job ledger entries as evidence
3. dispute.evidence_entry_ids links to every relevant record
4. Evidence package generated with Merkle proofs (tamper-evident)
5. Reviewer examines telemetry: power draw, network calls, GPU usage
6. ledger.resolveDispute(dispute_id, outcome, ...) closes the case
7. Refund (if any) triggers REFUND_ISSUED entry
```

---

## Files

```
src/
├── types.ts          All types: LedgerEntry, MerkleBlock, Dispute, EvidencePackage
├── hash-chain.ts     SHA-256 chain + Merkle tree implementation
├── ledger-service.ts Core service: commit, query, verify, disputes, evidence
├── event-emitter.ts  Typed event helpers for all pillars and chambers
└── index.ts          Public export surface
```

---

## What agents must implement

**`LedgerStore`** — PostgreSQL with append-only enforcement. Critical: the `append()` method must use INSERT only, never UPDATE/DELETE. Add a DB trigger that rejects any UPDATE/DELETE on the ledger table.

**`SequenceCounter`** — Redis `INCR` on key `obsidian:sequence`. Must be atomic. This is the block index source of truth.

**Database constraint** — Add a PostgreSQL check constraint: `block_index` must be unique and monotonically increasing. The `prev_hash` of entry N must equal `block_hash` of entry N-1.
