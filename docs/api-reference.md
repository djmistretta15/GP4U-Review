# API Reference

All routes require a valid Bearer token unless marked **[PUBLIC]**.
Token format: `Bearer <base64url(payload)>.<base64url(HMAC-SHA256)>`
Admin routes require clearance level ≥ 3.

Base URL: `https://gp4u.com`

---

## Authentication

All authenticated requests:
```
Authorization: Bearer <token>
```

The token payload contains `{ sub: uuid, clr: number, trs: number, exp: unix_timestamp }`.
Tokens are verified by HMAC-SHA256 in the edge middleware.

---

## Jobs

### `GET /api/jobs`
List the authenticated user's jobs.

**Response:**
```json
{
  "jobs": [
    {
      "id": "job_...",
      "name": "BERT fine-tune",
      "status": "RUNNING",
      "gpuId": "gpu_...",
      "costEstimate": 12.40,
      "workload_type": "TRAINING",
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

---

### `POST /api/jobs`
Submit a new compute job.

**Rate limit:** 30 requests/min

**Request:**
```json
{
  "name": "BERT fine-tune — medical NLP",
  "gpuId": "gpu_abc123",
  "workload_type": "TRAINING",
  "expectedDurationHours": 4.0
}
```

**Notes:**
- `costEstimate` is computed server-side from `gpu.pricePerHour × expectedDurationHours` — never accepted from client
- `workload_type` must be one of: `TRAINING`, `INFERENCE`, `FINE_TUNING`, `DATA_PROCESSING`, `RENDERING`, `SIMULATION`, `BATCH`, `INTERACTIVE`

**Response:** `201 Created`
```json
{
  "id": "job_...",
  "status": "PENDING",
  "costEstimate": 12.40
}
```

---

### `PATCH /api/jobs`
Update a job's status. Only the job owner can update their jobs.

**Request:**
```json
{
  "id": "job_...",
  "status": "COMPLETE",
  "actual_cost": 11.80,
  "energy_kwh": 4.72
}
```

**Notes:**
- `status` must be one of: `RUNNING`, `COMPLETE`, `FAILED`
- Ownership verified: `job.userId === auth.user.id`

---

## Memory Staking

### `GET /api/memory`
List the authenticated user's memory stakes.

---

### `POST /api/memory`
Create a new memory stake (offer idle VRAM/RAM for passive yield).

**Rate limit:** 10 requests/min

**Request:**
```json
{
  "gpuId": "gpu_...",
  "vram_gb": 16,
  "ram_gb": 32,
  "asking_price_per_gb_sec": 0.000001,
  "idle_schedule": "0 22 * * *"
}
```

**Notes:**
- `asking_price_per_gb_sec`: min `1e-9`, max `1.0`
- `vram_gb`: bounded by GPU's actual VRAM

---

### `DELETE /api/memory?id=<stake_id>`
Deactivate a memory stake. Atomic operation — eliminates check-then-act race condition.

---

## Clusters

### `GET /api/clusters`
List the authenticated user's clusters and available GPU pools.

**Response:**
```json
{
  "clusters": [...],
  "available_pools": [
    {
      "gpu_type": "RTX4090",
      "provider": "RUNPOD",
      "region": "us-east-1",
      "available_count": 8,
      "price_per_gpu_hour": 0.74
    }
  ]
}
```

---

### `POST /api/clusters`
Reserve a multi-GPU cluster. TOCTOU-safe — GPU allocation is atomic via Prisma transaction.

**Rate limit:** 5 requests/min

**Request:**
```json
{
  "gpu_type": "A100",
  "gpu_count": 4,
  "duration_hours": 8,
  "workload_type": "TRAINING",
  "name": "LLaMA fine-tune cluster"
}
```

---

## Provider Onboarding

### `GET /api/providers/onboard?tier=COMMERCIAL&gpu_count=8`
Get a stake requirement quote before registering.

**Response [PUBLIC — no auth required for quotes]:**
```json
{
  "requirement": {
    "tier": "COMMERCIAL",
    "gpu_count": 8,
    "cash_stake_usd": 280,
    "per_gpu_usd": 35,
    "requires_audit": false,
    "rationale": "8 GPU(s) × $35/GPU = $280 stake"
  }
}
```

---

### `POST /api/providers/onboard`
Register a new provider node.

**Rate limit:** 5 per 24 hours per IP

**University request:**
```json
{
  "node_id": "node_...",
  "tier": "UNIVERSITY",
  "region": "us-east-1",
  "gpu_count": 16,
  "gpu_models": ["NVIDIA A100 80GB", "NVIDIA A100 80GB"],
  "total_vram_gb": 1280,
  "institution_name": "MIT CSAIL",
  "institution_email": "researcher@mit.edu",
  "mou_accepted": true,
  "visibility_consent": true
}
```

**Commercial request:**
```json
{
  "node_id": "node_...",
  "tier": "COMMERCIAL",
  "region": "us-west-2",
  "gpu_count": 4,
  "gpu_models": ["NVIDIA GeForce RTX 4090"],
  "total_vram_gb": 96,
  "visibility_consent": true
}
```

**Response:** `201 Created`
```json
{
  "node_id": "node_...",
  "status": "PENDING_VERIFICATION",
  "tier": "UNIVERSITY",
  "stake_requirement": { "cash_stake_usd": 0, ... },
  "next_steps": "Your node is pending MOU verification. An admin will review within 2 business days."
}
```

---

## ZK Proofs

### `POST /api/providers/{nodeId}/zk-proofs`
Submit a ZK attestation proof. Verified immediately on receipt.

**Request:**
```json
{
  "proof_type": "HARDWARE_ATTESTATION",
  "proof_data": "<base64-encoded STARK proof>",
  "verification_key": "gp4u:hardware-attestation:v1.0.0",
  "public_inputs": {
    "job_id": "job_...",
    "gpu_model": "NVIDIA RTX 4090",
    "vram_declared_gb": 24,
    "vram_peak_used_gb": 22.1,
    "duration_s": 14400
  },
  "generated_at": "2024-01-15T14:00:00Z"
}
```

---

### `GET /api/providers/{nodeId}/zk-proofs`
List proofs for a node. Non-owners only see `VERIFIED` proofs.

---

## Appeals

### `POST /api/appeals`
File an appeal against a slash event.

**Rate limit:** 3 per 24 hours per IP

**Request:**
```json
{
  "slash_event_id": "...",
  "statement": "The VRAM overclaim was caused by a driver bug. Attached nvidia-smi logs confirm the measurement error.",
  "evidence_urls": ["https://drive.google.com/..."]
}
```

---

### `GET /api/appeals`
List the caller's appeal records.

---

### `PATCH /api/appeals/{appealId}` (Admin)
Resolve an appeal.

**Request:**
```json
{
  "accepted": true,
  "resolution_note": "Evidence reviewed. VRAM reading confirmed as driver measurement artifact. Slash reversed."
}
```

---

## Admin

All admin routes require `clearance_level ≥ 3`.

### `GET /api/admin/chambers`
List all chamber states.

### `POST /api/admin/chambers`
Activate, deactivate, or backtest a chamber.

```json
{
  "chamber_id": "mnemo",
  "action": "activate",
  "from": "2024-01-01T00:00:00Z",
  "to": "2024-01-14T23:59:59Z"
}
```

---

### `GET /api/admin/ledger`
Paginated Obsidian ledger explorer.

**Query params:** `page`, `limit` (1–100), `event_type`, `subject_id`

---

### `POST /api/admin/slash` (Admin)
Issue a slash event against a provider node.

```json
{
  "node_id": "node_...",
  "condition": "VRAM_OVERCLAIM",
  "evidence_summary": "vram_used=25.3GB, vram_allocated=24GB at 2024-01-15T14:23:00Z",
  "evidence_payload": { "telemetry_snapshot": { ... } }
}
```

---

## Health

### `GET /api/health/public` [PUBLIC]
Minimal liveness probe. Safe for load balancers and uptime monitors.

```json
{ "status": "ok", "timestamp": "2024-01-15T14:00:00Z" }
```

### `GET /api/health` (Authenticated)
Detailed platform health — chamber statuses, event bus stats.

---

## Workload Advisor

### `POST /api/workload/recommend`
Get a GPU recommendation for a described workload.

**Request:**
```json
{
  "description": "Fine-tuning LLaMA 7B on 50k medical records",
  "framework": "pytorch",
  "model_size_b": 7,
  "dataset_size_gb": 12,
  "precision": "bf16",
  "budget_usd": 50
}
```

**Response:**
```json
{
  "recommendation": {
    "gpu_type": "A100 80GB",
    "gpu_count": 1,
    "vram_required_gb": 28,
    "estimated_duration_hours": 6.5,
    "estimated_cost_usd": 22.75,
    "confidence": "HIGH",
    "reasoning": "7B parameter model at bf16 requires ~14GB VRAM plus optimizer states (~14GB) = ~28GB. A100 80GB provides comfortable headroom.",
    "alternatives": [...]
  }
}
```

---

## QR Codes

### `GET /api/qr?type=invite&ref=CODE` [PUBLIC]
Generate a QR code image (PNG) for invite links.

### `GET /api/qr?type=provider` [PUBLIC]
Generate a QR code for provider onboarding.

### `GET /join/{code}` [PUBLIC]
Landing page for QR code scans — pre-fills registration with referral context.
