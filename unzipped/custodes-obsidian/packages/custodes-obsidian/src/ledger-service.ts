/**
 * CUSTODES OBSIDIAN — Ledger Service
 *
 * The central service for committing and querying the immutable audit ledger.
 * All other Custodes pillars and GP4U chambers call this service to record events.
 *
 * Key guarantees:
 *   1. Every event gets a cryptographic block hash linking it to the previous entry
 *   2. Every 100 entries are sealed into a signed Merkle block
 *   3. Entries can never be modified or deleted
 *   4. Chain integrity can be verified at any time
 */

import { importPKCS8, SignJWT } from 'jose'
import { v4 as uuidv4 } from 'uuid'
import {
  LedgerEntry,
  LedgerEventType,
  LedgerEventSeverity,
  MerkleBlock,
  CommitEventRequest,
  CommitEventResponse,
  VerifyChainRequest,
  VerifyChainResponse,
  LedgerQuery,
  LedgerQueryResult,
  EvidencePackage,
  MerkleProof,
  ObsidianConfig,
  Dispute,
  DisputeStatus,
  DisputeOutcome,
} from './types'
import {
  computePayloadHash,
  computeBlockHash,
  hashIPAddress,
  verifyChain,
  buildMerkleTree,
  generateMerkleProof,
  verifyMerkleProof,
  sealMerkleBlock,
  GENESIS_HASH,
} from './hash-chain'

// ─── Storage Interface (implement with your DB) ───────────────────────────────

export interface LedgerStore {
  // Entry operations
  append(entry: LedgerEntry): Promise<void>
  getByIndex(block_index: number): Promise<LedgerEntry | null>
  getLatestIndex(): Promise<number>
  getLatestHash(): Promise<string>
  query(query: LedgerQuery): Promise<{ entries: LedgerEntry[]; total: number }>

  // Merkle block operations
  saveMerkleBlock(block: MerkleBlock): Promise<void>
  getMerkleBlock(block_number: number): Promise<MerkleBlock | null>
  getLatestMerkleBlock(): Promise<MerkleBlock | null>

  // Dispute operations
  createDispute(dispute: Dispute): Promise<void>
  updateDispute(dispute_id: string, update: Partial<Dispute>): Promise<void>
  getDispute(dispute_id: string): Promise<Dispute | null>
  getDisputesForJob(job_id: string): Promise<Dispute[]>
}

// ─── Sequence Counter (implement with Redis atomic increment) ─────────────────

export interface SequenceCounter {
  next(): Promise<number>  // Atomic increment, returns next sequence number
}

// ─── Ledger Service ───────────────────────────────────────────────────────────

export class ObsidianLedgerService {
  private config: ObsidianConfig
  private store: LedgerStore
  private sequence: SequenceCounter
  private pendingEntries: LedgerEntry[] = []
  private currentBlockNumber = 0

  constructor(
    config: ObsidianConfig,
    store: LedgerStore,
    sequence: SequenceCounter
  ) {
    this.config = config
    this.store = store
    this.sequence = sequence
  }

  /**
   * Commit a new event to the ledger.
   * This is the primary method called by all other pillars.
   *
   * Thread safety: Uses atomic sequence counter + DB append-only writes.
   */
  async commit(request: CommitEventRequest): Promise<CommitEventResponse> {
    const entry_id    = uuidv4()
    const block_index = await this.sequence.next()
    const prev_hash   = block_index === 0
      ? GENESIS_HASH
      : await this.store.getLatestHash()
    const timestamp   = new Date().toISOString()
    const seq         = block_index  // Use block_index as sequence (already atomic)

    // Hash IP for privacy
    const ip_address_hash = hashIPAddress(request.ip_address)

    // Build partial entry (without hashes)
    const partial: Omit<LedgerEntry, 'payload_hash' | 'block_hash' | 'merkle_root'> = {
      entry_id,
      block_index,
      event_type:      request.event_type,
      severity:        request.severity ?? this.defaultSeverity(request.event_type),
      subject_id:      request.subject_id,
      passport_id:     request.passport_id,
      institution_id:  request.institution_id,
      target_id:       request.target_id,
      target_type:     request.target_type,
      metadata:        request.metadata,
      ip_address_hash,
      region:          request.region,
      timestamp,
      sequence:        seq,
      prev_hash,
    }

    // Compute hashes
    const payload_hash = computePayloadHash(partial)
    const block_hash   = computeBlockHash(payload_hash, prev_hash, block_index)

    const entry: LedgerEntry = {
      ...partial,
      payload_hash,
      block_hash,
      prev_hash,
      merkle_root: undefined,
    }

    // Persist
    await this.store.append(entry)

    // Check if we should seal a Merkle block
    this.pendingEntries.push(entry)
    if (this.pendingEntries.length >= this.config.merkle_block_size) {
      await this.sealCurrentBlock()
    }

    return {
      entry_id,
      block_index,
      block_hash,
      timestamp,
    }
  }

  /**
   * Verify the integrity of a range of blocks.
   * Use this for compliance audits, dispute investigation, or scheduled checks.
   */
  async verifyChainRange(request: VerifyChainRequest): Promise<VerifyChainResponse> {
    const entries: LedgerEntry[] = []

    for (let i = request.from_block; i <= request.to_block; i++) {
      const entry = await this.store.getByIndex(i)
      if (!entry) {
        return {
          valid: false,
          blocks_checked: i - request.from_block,
          first_invalid_block: i,
          error: `Missing entry at block index ${i}`,
        }
      }
      entries.push(entry)
    }

    const result = verifyChain(entries)

    return {
      valid: result.valid,
      blocks_checked: result.entries_checked,
      first_invalid_block: result.first_invalid_index,
      error: result.error,
    }
  }

  /**
   * Query the ledger with filters.
   * Returns entries matching the query with total count for pagination.
   */
  async query(query: LedgerQuery): Promise<LedgerQueryResult> {
    const { entries, total } = await this.store.query(query)

    const from_block = entries.length > 0
      ? Math.min(...entries.map(e => e.block_index))
      : 0
    const to_block = entries.length > 0
      ? Math.max(...entries.map(e => e.block_index))
      : 0

    // Hash the query params for auditability
    const query_hash = require('./hash-chain').sha256(JSON.stringify(query))

    return { entries, total, from_block, to_block, query_hash }
  }

  /**
   * Generate a verified evidence package for a job, dispute, or subject.
   * Used for dispute resolution and regulatory reporting.
   * The package is signed by Obsidian and can be verified independently.
   */
  async generateEvidencePackage(
    subject: 'JOB' | 'DISPUTE' | 'SUBJECT' | 'INSTITUTION',
    subject_id: string
  ): Promise<EvidencePackage> {
    // Query all entries related to this subject
    const { entries } = await this.store.query({
      target_id: subject_id,
      limit: 1000,
    })

    // Build Merkle proofs for each entry
    const entry_hashes  = entries.map(e => e.block_hash)
    const { tree, root } = buildMerkleTree(entry_hashes)

    const merkle_proofs: MerkleProof[] = entries.map((entry, idx) => ({
      entry_id:    entry.entry_id,
      block_number: this.currentBlockNumber,
      leaf_index:  idx,
      proof_path:  generateMerkleProof(idx, tree),
      merkle_root: root,
    }))

    const package_id   = uuidv4()
    const generated_at = new Date().toISOString()

    // Sign the package
    const private_key = await importPKCS8(this.config.private_key_pem, 'RS256')
    const payload = {
      package_id,
      subject,
      subject_id,
      entry_count: entries.length,
      merkle_root: root,
      generated_at,
    }
    const signature = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.config.instance_id)
      .sign(private_key)

    return {
      package_id,
      subject,
      subject_id,
      entries,
      merkle_proofs,
      generated_at,
      generated_by: this.config.instance_id,
      signature,
    }
  }

  /**
   * Open a dispute against a job.
   * Automatically collects all relevant ledger entries as evidence.
   */
  async openDispute(
    job_id: string,
    opened_by: string,
    against: string,
    reason: Dispute['reason'],
    description: string
  ): Promise<Dispute> {
    const dispute_id = uuidv4()

    // Collect all job-related entries as evidence
    const { entries } = await this.store.query({
      target_id: job_id,
      limit: 500,
    })
    const evidence_entry_ids = entries.map(e => e.entry_id)

    const dispute: Dispute = {
      dispute_id,
      job_id,
      opened_by,
      against,
      reason,
      status: DisputeStatus.OPEN,
      evidence_entry_ids,
      opened_at: new Date().toISOString(),
    }

    await this.store.createDispute(dispute)

    // Record the dispute opening in the ledger itself
    await this.commit({
      event_type:  LedgerEventType.DISPUTE_OPENED,
      severity:    LedgerEventSeverity.WARN,
      subject_id:  opened_by,
      target_id:   job_id,
      target_type: 'JOB',
      metadata:    { dispute_id, reason, description, evidence_count: evidence_entry_ids.length },
      ip_address:  'system',
    })

    return dispute
  }

  /**
   * Resolve a dispute with an outcome and optional refund.
   */
  async resolveDispute(
    dispute_id: string,
    outcome: DisputeOutcome,
    resolved_by: string,
    notes: string,
    refund_amount?: number
  ): Promise<void> {
    const now = new Date().toISOString()

    await this.store.updateDispute(dispute_id, {
      status: DisputeStatus.RESOLVED,
      outcome,
      resolved_by,
      resolution_notes: notes,
      refund_amount,
      resolved_at: now,
    })

    await this.commit({
      event_type:  LedgerEventType.DISPUTE_RESOLVED,
      severity:    LedgerEventSeverity.INFO,
      subject_id:  resolved_by,
      target_id:   dispute_id,
      target_type: 'DISPUTE',
      metadata:    { outcome, notes, refund_amount },
      ip_address:  'system',
    })
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async sealCurrentBlock(): Promise<void> {
    if (this.pendingEntries.length === 0) return

    const entries_to_seal = [...this.pendingEntries]
    this.pendingEntries = []

    const block = sealMerkleBlock(
      entries_to_seal,
      this.currentBlockNumber,
      this.config.instance_id
    )

    // Sign the Merkle root
    const private_key = await importPKCS8(this.config.private_key_pem, 'RS256')
    const signature = await new SignJWT({ merkle_root: block.merkle_root, block_number: block.block_number })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(this.config.instance_id)
      .sign(private_key)

    const sealed: MerkleBlock = { ...block, signature }
    await this.store.saveMerkleBlock(sealed)

    // Update each entry with the merkle root
    for (const entry of entries_to_seal) {
      entry.merkle_root = block.merkle_root
    }

    this.currentBlockNumber++
  }

  private defaultSeverity(event_type: LedgerEventType): LedgerEventSeverity {
    const security_events = new Set([
      LedgerEventType.SUBJECT_BANNED,
      LedgerEventType.ANOMALY_DETECTED,
      LedgerEventType.THREAT_FLAGGED,
      LedgerEventType.KILL_SWITCH_FIRED,
      LedgerEventType.CLEARANCE_REVOKED,
    ])
    const warn_events = new Set([
      LedgerEventType.AUTH_FAILED,
      LedgerEventType.POLICY_DENY,
      LedgerEventType.JOB_FAILED,
      LedgerEventType.DISPUTE_OPENED,
      LedgerEventType.BENCHMARK_FAILED,
    ])

    if (security_events.has(event_type)) return LedgerEventSeverity.SECURITY
    if (warn_events.has(event_type))     return LedgerEventSeverity.WARN
    return LedgerEventSeverity.INFO
  }
}
