# Job Pipeline — End-to-End Lifecycle

Every compute job on GP4U travels through a well-defined pipeline with checkpoints, monitoring, and an immutable audit trail at each stage. This document traces a job from the moment a customer submits it to the moment results are delivered.

---

## Stage 0 — Identity & Authorization

Before a request reaches any route, it passes through the middleware layer:

```
Customer Request
      │
      ▼
┌─────────────────────────────────────┐
│  Middleware (middleware.ts)          │
│                                     │
│  1. Extract Bearer token            │
│  2. Verify HMAC-SHA256 signature    │
│  3. Decode payload: { sub, clr,    │
│     trs, exp }                      │
│  4. Check expiry                    │
│  5. Inject x-subject-id header      │
│  6. Gate admin routes (clr ≥ 3)     │
└──────────────┬──────────────────────┘
               │ (passes or 401/403)
               ▼
```

If the token is missing, expired, or tampered with — the request is rejected at the edge before touching any database.

---

## Stage 1 — Job Submission

**Route:** `POST /api/jobs`

The customer (or their CLI/SDK) submits a job manifest:

```json
{
  "name": "BERT fine-tune — medical NLP",
  "gpuId": "gpu_abc123",
  "workload_type": "TRAINING",
  "expectedDurationHours": 4.0
}
```

**What happens:**

1. `requireAuth()` — confirms the caller is a real, active user
2. Rate limit check — 30 jobs/min per user (prevents job spam)
3. Input validation — name length, duration bounds (0.1h – 720h)
4. GPU lookup — confirms the GPU exists and is AVAILABLE
5. **Cost computed server-side** — `gpu.pricePerHour × duration` (never trusted from client)
6. Job record created in database (status: PENDING)
7. `publishJobCreated(event)` fires on the event bus

```
Event Bus → Chambers receive job.created:
  Mnemo:     records demand signal, checks memory availability
  Aetherion: notes routing candidate for this GPU's region
  Outerim:   tracks edge demand signal
```

**Response to customer:**
```json
{
  "id": "job_xyz789",
  "status": "PENDING",
  "costEstimate": 12.40,
  "gpu": { "name": "RTX 4090", "region": "us-east-1" }
}
```

---

## Stage 2 — GPU Allocation & Job Assignment

Atlas (the routing subsystem) selects the best physical GPU node for the job, weighing:

- Chamber routing preferences (from Mnemo, Aetherion, Outerim, Energy)
- Real-time GPU availability and trust score
- Veritas provenance scores for reproducibility-sensitive workloads
- Geographic latency (Aetherion)
- Carbon intensity of the region (Energy Broker)

The selected provider's daemon picks up the job assignment on its next poll cycle (every 15 seconds).

---

## Stage 3 — Provider Agent Execution

The **Provider Agent** (`apps/provider-agent/`) receives the job manifest and:

**3a. Image Verification**
```python
# Pull image using digest-pinned reference
image_ref = f"{manifest.docker_image}@{manifest.docker_image_sha256}"
docker pull image_ref  # Docker verifies SHA256 on pull
```

**3b. Secure Container Launch**
```
docker run
  --gpus device=N          # Only the assigned GPU
  --memory <ram_limit>     # Hard memory cap
  --pids-limit 512         # No fork bombs
  --cap-drop ALL           # Zero Linux capabilities
  --security-opt no-new-privileges
  --read-only              # Read-only root filesystem
  --network bridge         # Outbound NAT, no inbound
  --volume /input:ro       # Customer inputs (read-only)
  --volume /output:rw      # Job outputs
  --env KEY=sanitized_val  # Declared vars only; values sanitized
  image@sha256:...         # Digest-pinned image
```

**3c. Watchdog Thread**
A background thread runs every 10 seconds:
- Collects GPU telemetry (NVML readings: utilization, VRAM, power, temp)
- Collects network telemetry (psutil: outbound bytes, unique destination IPs)
- Infers workload pattern (TRAINING / INFERENCE / CRYPTO_MINING / IDLE)
- POSTs to `/api/telemetry/russian-doll`
- **If platform responds `kill_job: true` → container killed immediately**

**3d. Duration Watchdog**
Container is automatically killed if it exceeds `declared_duration × 1.1`. No job can run indefinitely.

---

## Stage 4 — Telemetry Ingestion (Russian-Doll)

**Route:** `POST /api/telemetry/russian-doll`

The platform receives telemetry every 10 seconds per running job:

```json
{
  "job_id": "job_xyz789",
  "node_id": "node_...",
  "gpu_utilization_pct": 94.2,
  "vram_used_gb": 22.1,
  "vram_allocated_gb": 24.0,
  "power_draw_watts": 380.0,
  "temperature_c": 82,
  "outbound_bytes_per_sec": 1200000,
  "inferred_pattern": "TRAINING"
}
```

**Platform actions:**

1. Verifies job ownership (job exists, status PENDING/RUNNING)
2. Clamps all numeric inputs (prevents poisoned telemetry)
3. Runs anomaly detection (Russian-Doll → Tutela translator):
   - VRAM_OVERCLAIM (usage > allocation)
   - CRYPTO_MINING_PATTERN (mining-like GPU + network fingerprint)
   - HIGH_OUTBOUND_BANDWIDTH (>100 MB/s)
   - OUTBOUND_PORT_SCAN (>50 unique IPs)
   - THERMAL_THROTTLE_SUSTAINED
4. Updates job record with latest metrics
5. Fires Tutela events if anomalies detected
6. Returns `{ kill_job: true/false }` to the agent

---

## Stage 5 — Job Completion

When the container exits (or is killed):

1. Provider agent POSTs final telemetry with exit code
2. Platform updates job status → COMPLETE or FAILED
3. Calculates actual energy consumption (`sum(power_draw_watts) × duration / 3,600,000` kWh)
4. Updates carbon accounting (`energy_kwh × grid_carbon_factor`)
5. Fires `publishJobCompleted(event)` on event bus:
   ```
   Veritas:  records reproducibility proof
   Energy:   logs carbon accounting, checks for credit eligibility
   Mnemo:    updates provider uptime stats
   Obsidian: seals job completion in ledger
   ```

---

## Stage 6 — ZK Proof Generation (Post-Job)

After job completion, the provider agent generates attestation proofs:

**Hardware Attestation**
> "This job ran on an NVIDIA RTX 4090 with 24GB VRAM — cryptographic proof attached."

**Energy Attestation**
> "This job consumed 4.7 kWh, 80% from renewable sources — carbon credit eligible."

Proofs are submitted to `/api/providers/{nodeId}/zk-proofs` and stored in the `ZKProof` table. Customers can verify them independently.

---

## Stage 7 — Billing & Settlement

1. Actual cost settled: `actual_gpu_hours × pricePerHour`
2. Platform fee deducted (percentage)
3. Provider earnings credited
4. If university provider: student program share allocated
5. LedgerEntry sealed for the financial transaction

---

## Failure Paths

| Failure | Detection | Response |
|---|---|---|
| Provider drops job mid-execution | Heartbeat timeout (>60s with no telemetry) | Platform marks job FAILED, triggers JOB_DROPPED_UNEXPECTEDLY slash |
| Crypto mining detected | CRYPTO_MINING_PATTERN in telemetry | `kill_job: true` returned immediately; CRYPTO_MINING_DURING_ML_JOB hard slash |
| VRAM overrun | `vram_used > vram_allocated` in telemetry | VRAM_OVERCLAIM soft slash logged to Obsidian |
| Visibility blocked | Heartbeat fails with connection refused | VISIBILITY_BLOCKED hard slash + ejection |
| Duration exceeded | Watchdog timer fires | Container killed; job marked FAILED; no slash (provider not at fault) |

---

## Timeline Summary

```
T+0s    Customer submits job
T+1s    Auth verified, job created, event bus notified
T+15s   Provider agent polls and receives job assignment
T+20s   Image digest verified, container starts
T+30s   First telemetry packet received
T+10s   Telemetry every 10s throughout execution
T+Nh    Job completes (N = declared duration)
T+Nh+5s Final telemetry + status update
T+Nh+30s ZK proofs generated and submitted
T+Nh+1m  Billing settled, ledger sealed
```
