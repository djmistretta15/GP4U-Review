# ZK Attestation — Truth Made Cryptographic

GP4U is built on a philosophy of truth. But "trust us" is not good enough for enterprise customers, regulated industries, or anyone making serious financial decisions about compute. Zero-knowledge attestation closes the gap: instead of asking customers to believe our reporting, we give them cryptographic proofs they can verify themselves.

---

## What Is a Zero-Knowledge Proof?

A ZK proof lets you prove a statement is true without revealing the underlying data.

Example: You can prove you are over 18 without showing your birth date. You can prove a number is prime without showing the number.

In compute:
> "I can prove this job ran on an NVIDIA H100 — without revealing the job's model weights, the customer's identity, or any data that passed through the node."

This is exactly what GP4U needs. Providers have legitimate privacy interests (they don't want to reveal their customers). Customers have legitimate verification interests (they want to know they got what they paid for). ZK proofs satisfy both at once.

---

## The Three Circuits

### 1. Hardware Attestation

**What it proves:** A specific job ran on declared hardware (GPU model, VRAM, driver version).

**What stays private:** Job contents, model weights, customer identity, other hardware details.

**How it works:**

The provider's agent runs a Rust guest program inside the RISC Zero zkVM. This guest program:
1. Reads the GPU hardware report from nvidia-smi / pynvml (private input)
2. Reads the job manifest (private input): declared `gpu_model`, `vram_gb`
3. Reads the execution log (private input): actual `vram_peak_gb`, `duration_s`
4. Verifies: `actual_gpu_model === declared_gpu_model`
5. Verifies: `actual_vram_peak_gb <= declared_vram_gb`
6. Commits to the journal (public output): `{ job_id, gpu_model, vram_gb, duration_s, timestamp }`

The journal is what anyone can see. The STARK proof cryptographically guarantees the guest program ran correctly over *some* private inputs that satisfy the constraints.

**Public outputs (what the world sees):**
```typescript
{
  job_id:            "job_xyz789",
  node_id:           "node_...",
  gpu_model:         "NVIDIA GeForce RTX 4090",
  vram_declared_gb:  24,
  vram_peak_used_gb: 22.1,
  duration_s:        14400,
  attested_at_epoch: 1705334400
}
```

**Use cases:**
- Customer disputes whether they got the GPU they paid for → verifiable proof
- Enterprise procurement requires hardware documentation → ZK certificate attached to invoice
- Veritas reputation score backed by cryptographic hardware history

---

### 2. Energy Attestation

**What it proves:** A job consumed exactly N kWh, sourced from R% renewable energy, generating C kg CO₂e — qualifying for carbon credit issuance.

**What stays private:** Job contents, customer identity, exact node location, infrastructure details.

**Why this matters:**

Aetherion already tracks energy via the Russian-Doll telemetry loop. But raw telemetry is mutable — a provider could misreport power draw or claim renewable sources they don't have. ZK energy attestation creates a **verifiable carbon credit** that a registry (Gold Standard, Verra) can validate without seeing the job itself.

**Private inputs to the circuit:**
- Raw NVML power readings (per-second watt array)
- Signed grid operator API response (renewable % for the region)
- Node location hash (H(exact_location) — keeps location private while binding to a region)

**Public outputs:**
```typescript
{
  job_id:           "job_xyz789",
  node_id:          "node_...",
  gpu_model:        "NVIDIA A100",
  region:           "US-CA",
  energy_kwh:       4.72,
  renewable_pct:    82,
  carbon_kg_co2e:   0.283,
  duration_s:       14400,
  attested_at_epoch: 1705334400
}
```

**Carbon credit eligibility:**
- Minimum 50% renewable energy required for credit issuance
- Credits issued in tonnes CO₂e (1000 kg = 1 tonne)
- Only non-renewable fraction counted against the offset
- Revenue stream: **provider earns compute revenue + carbon credit revenue**

---

### 3. Uptime Attestation

**What it proves:** A provider maintained X% uptime over a period, completed N jobs, and had no active slash events — qualifying for a Veritas tier badge.

**What stays private:** Which customers were served, what jobs ran, any data that identifies clients.

**Why this matters:**

Veritas scores today are computed from raw telemetry — customers trust GP4U's reporting. With ZK uptime proofs:
- Providers can prove their track record to *new* customers without GP4U as intermediary
- Reputation becomes portable — providers can export proofs to partner platforms or protocol upgrades
- Universities can prove their cluster reliability to grant committees without revealing research data

**Veritas Tier Badges:**

| Badge | Uptime Threshold | Meaning |
|---|---|---|
| GOLD | ≥ 99.5% | < 4.4 hours downtime per month |
| SILVER | ≥ 99.0% | < 8.8 hours downtime per month |
| BRONZE | ≥ 95.0% | < 36.5 hours downtime per month |
| UNRATED | < 95.0% | Insufficient reliability history |

**Public outputs:**
```typescript
{
  node_id:            "node_...",
  period_start_epoch: 1703030400,
  period_end_epoch:   1705334400,
  uptime_pct:         99.7,
  jobs_completed:     847,
  jobs_failed:        3,
  active_slash_count: 0,
  veritas_tier:       "GOLD",
  attested_at_epoch:  1705334400
}
```

---

## Proof Lifecycle

```
1. Job completes on provider node
       │
       ▼
2. Provider agent runs ZK circuit guest program
   (RISC Zero zkVM — local or Bonsai API)
       │
       ▼
3. Receipt produced:
   - STARK proof (cryptographic proof bytes)
   - Journal (public outputs)
       │
       ▼
4. Agent submits to POST /api/providers/{nodeId}/zk-proofs
       │
       ▼
5. Platform verifies proof immediately on receipt
   - verifyProof() dispatches to correct circuit verifier
   - Valid → status: VERIFIED
   - Invalid → status: INVALID + warning logged
       │
       ▼
6. ZKProof stored in database (proof expires after 90 days)
       │
       ▼
7. Customer can verify at any time via GET /api/providers/{nodeId}/zk-proofs
   (Only VERIFIED proofs visible to non-owners)
```

---

## Technical Implementation

**zkVM:** RISC Zero (production target)
- Rust guest programs compiled to RISC-V and executed inside the zkVM
- Output: `Receipt` containing `inner` (STARK proof) and `journal` (public outputs)
- Verification: `receipt.verify(image_id)` — deterministic, no trusted setup

**Bonsai API:** Cloud proving service (for providers without local GPU proving capacity)
- Accepts guest program + stdin
- Returns receipt
- GP4U agent calls Bonsai, receives proof, submits to platform

**Current Status:** The TypeScript interface layer is complete and production-ready. The Rust guest programs are scaffolded with a commitment-based placeholder that is interface-compatible with real RISC Zero receipts. Swap the `proveHardware()` implementation for the Bonsai API call — no other changes needed.

**Circuit versioning:** Every proof is bound to a `verification_key` (the RISC Zero `image_id` — the hash of the compiled guest program). Old proofs remain verifiable forever because the key is pinned. Upgrading the circuit generates a new key; both old and new proofs can coexist.

---

## Why ZK and Not Just Signed Attestation?

Signed attestation (e.g. the platform signs a report saying "this job ran on X hardware") has a fundamental weakness: you still have to trust the signer. If GP4U is compromised, all attestations are suspect.

ZK proofs eliminate the trusted party. The proof is valid because of mathematics — not because you trust us. The guest program is open source. The circuit is published. Anyone can compile the program, verify the image_id matches the verification_key, and confirm that a receipt verifies against it.

This is what "truth through code" means at GP4U.
