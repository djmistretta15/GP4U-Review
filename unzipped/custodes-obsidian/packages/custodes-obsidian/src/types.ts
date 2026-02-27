/**
 * CUSTODES OBSIDIAN — Core Types
 * Evidence Vault, Tamper-Proof Audit Ledger & Dispute Resolution
 *
 * Obsidian is the immutable record of everything that happens in the stack.
 * Every job, every auth event, every policy decision, every anomaly —
 * all flow through Obsidian and become permanent, verifiable evidence.
 *
 * The ledger uses a Merkle hash chain: each block contains the hash of
 * the previous block. Tampering with any entry invalidates all subsequent
 * entries — making fraud or cover-up cryptographically detectable.
 *
 * Universities, enterprises, and regulators pay for this audit trail.
 */

// ─── Event Categories ─────────────────────────────────────────────────────────

export enum LedgerEventType {
  // Identity (from Dextera)
  AUTH_LOGIN          = 'AUTH_LOGIN',
  AUTH_LOGOUT         = 'AUTH_LOGOUT',
  AUTH_FAILED         = 'AUTH_FAILED',
  PASSPORT_ISSUED     = 'PASSPORT_ISSUED',
  PASSPORT_REVOKED    = 'PASSPORT_REVOKED',
  SUBJECT_BANNED      = 'SUBJECT_BANNED',

  // Resource (from Atlas)
  GPU_REGISTERED      = 'GPU_REGISTERED',
  GPU_DEREGISTERED    = 'GPU_DEREGISTERED',
  GPU_STATUS_CHANGED  = 'GPU_STATUS_CHANGED',
  ALLOCATION_CREATED  = 'ALLOCATION_CREATED',
  ALLOCATION_RELEASED = 'ALLOCATION_RELEASED',

  // Job lifecycle (from GP4U)
  JOB_SUBMITTED       = 'JOB_SUBMITTED',
  JOB_STARTED         = 'JOB_STARTED',
  JOB_COMPLETED       = 'JOB_COMPLETED',
  JOB_FAILED          = 'JOB_FAILED',
  JOB_CANCELLED       = 'JOB_CANCELLED',
  JOB_PREEMPTED       = 'JOB_PREEMPTED',

  // Policy (from Aedituus)
  POLICY_EVALUATED    = 'POLICY_EVALUATED',
  POLICY_ALLOW        = 'POLICY_ALLOW',
  POLICY_DENY         = 'POLICY_DENY',
  POLICY_STEP_UP      = 'POLICY_STEP_UP',
  POLICY_UPDATED      = 'POLICY_UPDATED',

  // Security (from Tutela)
  ANOMALY_DETECTED    = 'ANOMALY_DETECTED',
  THREAT_FLAGGED      = 'THREAT_FLAGGED',
  KILL_SWITCH_FIRED   = 'KILL_SWITCH_FIRED',
  CLEARANCE_REVOKED   = 'CLEARANCE_REVOKED',

  // Billing
  CHARGE_CREATED      = 'CHARGE_CREATED',
  CHARGE_SETTLED      = 'CHARGE_SETTLED',
  REFUND_ISSUED       = 'REFUND_ISSUED',

  // Disputes
  DISPUTE_OPENED      = 'DISPUTE_OPENED',
  DISPUTE_EVIDENCE    = 'DISPUTE_EVIDENCE',
  DISPUTE_RESOLVED    = 'DISPUTE_RESOLVED',

  // Platform chambers
  BENCHMARK_RUN       = 'BENCHMARK_RUN',
  BENCHMARK_FAILED    = 'BENCHMARK_FAILED',
  VRAM_ALLOCATED      = 'VRAM_ALLOCATED',
  TUNNEL_OPENED       = 'TUNNEL_OPENED',
  TUNNEL_CLOSED       = 'TUNNEL_CLOSED',

  // Administrative
  ADMIN_ACTION        = 'ADMIN_ACTION',
  SYSTEM_EVENT        = 'SYSTEM_EVENT',
}

export enum LedgerEventSeverity {
  INFO     = 'INFO',
  WARN     = 'WARN',
  CRITICAL = 'CRITICAL',
  SECURITY = 'SECURITY',
}

// ─── Ledger Entry ─────────────────────────────────────────────────────────────

/**
 * A single immutable record in the Obsidian ledger.
 * Once committed, entries cannot be modified or deleted.
 */
export interface LedgerEntry {
  // Identity
  entry_id: string              // UUID v4
  block_index: number           // Sequential block number (monotonic)

  // What happened
  event_type: LedgerEventType
  severity: LedgerEventSeverity

  // Who was involved
  subject_id: string            // Actor (from Dextera Passport)
  passport_id?: string          // Passport used for this action
  institution_id?: string       // If institutional actor
  target_id?: string            // Resource/job/subject being acted upon
  target_type?: string          // 'JOB' | 'GPU' | 'SUBJECT' | 'POLICY' | etc.

  // What the context was
  metadata: Record<string, unknown>   // Structured event-specific data
  ip_address_hash: string             // SHA-256 of IP (privacy-safe)
  region?: string                     // Geographic region of action

  // Integrity
  payload_hash: string          // SHA-256 of canonical event payload
  prev_hash: string             // Hash of previous block (chain link)
  block_hash: string            // SHA-256 of (payload_hash + prev_hash + block_index)
  merkle_root?: string          // Merkle root when block is sealed (every 100 entries)

  // Timestamps
  timestamp: string             // ISO 8601 — wall clock
  sequence: number              // Monotonic sequence within same millisecond
}

// ─── Merkle Block ────────────────────────────────────────────────────────────

/**
 * Every 100 LedgerEntries are sealed into a MerkleBlock.
 * The root hash is the cryptographic commitment to all 100 entries.
 * Clients can verify any single entry without downloading the full ledger.
 */
export interface MerkleBlock {
  block_number: number
  entry_start: number           // block_index of first entry
  entry_end: number             // block_index of last entry
  entry_hashes: string[]        // leaf hashes (one per entry)
  merkle_root: string           // root of the Merkle tree
  sealed_at: string             // ISO 8601
  sealed_by: string             // Obsidian instance ID
  signature: string             // RS256 signature over merkle_root
}

// ─── Dispute Types ────────────────────────────────────────────────────────────

export enum DisputeReason {
  GPU_UNDERPERFORMED   = 'GPU_UNDERPERFORMED',
  JOB_FAILED_HOST_SIDE = 'JOB_FAILED_HOST_SIDE',
  WORKLOAD_ABUSE       = 'WORKLOAD_ABUSE',
  UNAUTHORIZED_ACCESS  = 'UNAUTHORIZED_ACCESS',
  BILLING_ERROR        = 'BILLING_ERROR',
  DATA_BREACH          = 'DATA_BREACH',
  SLA_VIOLATION        = 'SLA_VIOLATION',
  FRAUDULENT_WORKLOAD  = 'FRAUDULENT_WORKLOAD',
}

export enum DisputeStatus {
  OPEN       = 'OPEN',
  EVIDENCE   = 'EVIDENCE',    // Collecting evidence
  REVIEWING  = 'REVIEWING',   // Under human review
  RESOLVED   = 'RESOLVED',
  ESCALATED  = 'ESCALATED',   // Sent to institution/legal
}

export enum DisputeOutcome {
  BUYER_WINS   = 'BUYER_WINS',
  HOST_WINS    = 'HOST_WINS',
  SPLIT        = 'SPLIT',
  NO_FAULT     = 'NO_FAULT',
  ESCALATED    = 'ESCALATED',
}

export interface Dispute {
  dispute_id: string
  job_id: string
  opened_by: string             // subject_id of complainant
  against: string               // subject_id of respondent
  reason: DisputeReason
  status: DisputeStatus
  outcome?: DisputeOutcome
  refund_amount?: number
  evidence_entry_ids: string[]  // LedgerEntry IDs as evidence
  resolution_notes?: string
  resolved_by?: string          // subject_id of resolver
  opened_at: string
  resolved_at?: string
}

// ─── Evidence Package ─────────────────────────────────────────────────────────

/**
 * A verified evidence package for a job or dispute.
 * Contains all ledger entries related to a specific job,
 * with Merkle proofs that each entry is untampered.
 */
export interface EvidencePackage {
  package_id: string
  subject: 'JOB' | 'DISPUTE' | 'SUBJECT' | 'INSTITUTION'
  subject_id: string
  entries: LedgerEntry[]
  merkle_proofs: MerkleProof[]
  generated_at: string
  generated_by: string          // Obsidian instance
  signature: string             // Signature over the full package
}

export interface MerkleProof {
  entry_id: string
  block_number: number
  leaf_index: number
  proof_path: string[]          // Sibling hashes from leaf to root
  merkle_root: string
}

// ─── Query Types ─────────────────────────────────────────────────────────────

export interface LedgerQuery {
  subject_id?: string
  target_id?: string
  event_types?: LedgerEventType[]
  severity?: LedgerEventSeverity[]
  institution_id?: string
  from?: string                 // ISO 8601
  to?: string                   // ISO 8601
  limit?: number                // default 100, max 1000
  offset?: number
}

export interface LedgerQueryResult {
  entries: LedgerEntry[]
  total: number
  from_block: number
  to_block: number
  query_hash: string            // Hash of query params for audit
}

// ─── API Interfaces ───────────────────────────────────────────────────────────

export interface CommitEventRequest {
  event_type: LedgerEventType
  severity?: LedgerEventSeverity
  subject_id: string
  passport_id?: string
  institution_id?: string
  target_id?: string
  target_type?: string
  metadata: Record<string, unknown>
  ip_address: string            // Raw IP — Obsidian hashes it internally
  region?: string
}

export interface CommitEventResponse {
  entry_id: string
  block_index: number
  block_hash: string
  timestamp: string
}

export interface VerifyChainRequest {
  from_block: number
  to_block: number
}

export interface VerifyChainResponse {
  valid: boolean
  blocks_checked: number
  first_invalid_block?: number
  error?: string
}

export interface ObsidianConfig {
  instance_id: string
  private_key_pem: string       // For signing Merkle blocks and evidence packages
  public_key_pem: string
  merkle_block_size: number     // Default: 100 entries per block
  retention_days: number        // How long to keep entries (regulatory minimum)
}
