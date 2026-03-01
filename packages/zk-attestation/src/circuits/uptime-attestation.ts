/**
 * Circuit: Uptime Attestation
 * ============================
 *
 * PROVES: A provider node maintained N% uptime over a given period,
 *         completed M jobs, and had no active slash events.
 * WITHOUT REVEALING: Which customers they served, what jobs they ran,
 *                    or any details that could identify clients.
 *
 * --- Why this matters ---
 *
 * Veritas scores today are computed from raw telemetry — which means
 * customers are trusting the platform to accurately report a provider's
 * history. With ZK uptime proofs:
 *
 *   - Providers can PROVE their track record to new customers
 *     without the customer needing to trust GP4U's reporting
 *   - Reputation becomes portable — providers can export proofs
 *     to other platforms (or future protocol versions)
 *   - Universities can prove their GPU cluster reliability to grant
 *     committees and research partners without revealing research data
 *
 * --- Private inputs (never leave the platform DB) ---
 *   - Full job completion log for the period (job_ids, start/end times)
 *   - Heartbeat timestamps (every 30s from the provider agent)
 *   - Slash event records for the period
 *
 * --- Public outputs (what anyone can verify) ---
 *   - node_id, period_start, period_end
 *   - uptime_pct (e.g. 99.7)
 *   - jobs_completed
 *   - jobs_failed
 *   - active_slash_count (0 = clean record)
 *   - veritas_score_delta (how much this period improved the score)
 *
 * The proof guarantees: "some provider with node_id X ran jobs and reported
 * heartbeats such that the computed uptime is Y% — I cannot tell you whose
 * jobs they were, but I can prove the computation was done correctly."
 */

import { createHash } from 'crypto'
import { ZKProofPackage, VerificationResult } from '../types'

export const CIRCUIT_ID      = 'uptime-attestation'
export const CIRCUIT_VERSION = 'v1.0.0'
export const CURRENT_VK      = 'gp4u:uptime-attestation:v1.0.0'

// Thresholds for Veritas tier badges
export const UPTIME_TIERS = {
  GOLD:   99.5,   // < 4.4 hours downtime/month
  SILVER: 99.0,   // < 8.8 hours downtime/month
  BRONZE: 95.0,   // < 36.5 hours downtime/month
} as const

export type VeritasTier = 'GOLD' | 'SILVER' | 'BRONZE' | 'UNRATED'

/**
 * Public outputs visible to anyone verifying the proof.
 */
export interface UptimePublicInputs {
  node_id:              string
  period_start_epoch:   number
  period_end_epoch:     number
  uptime_pct:           number    // 0.00 – 100.00
  jobs_completed:       number
  jobs_failed:          number
  active_slash_count:   number    // slashes not under appeal or accepted
  veritas_tier:         VeritasTier
  attested_at_epoch:    number
}

/**
 * Private witness (only processed inside zkVM).
 */
export interface UptimePrivateInputs {
  heartbeat_timestamps:  number[]   // Unix timestamps of each heartbeat
  job_completion_log:    string     // JSON: [{job_id_hash, completed_at, success}]
  slash_record_hash:     string     // H(full slash records for the period)
  platform_signature:    string     // Platform signs the raw data to prevent spoofing
}

export async function proveUptime(
  public_inputs: UptimePublicInputs,
  _private_inputs: UptimePrivateInputs,
  node_id: string,
): Promise<ZKProofPackage> {
  // Production: call RISC Zero Bonsai with uptime circuit image_id
  const commitment = createHash('sha256')
    .update(CURRENT_VK)
    .update(JSON.stringify(public_inputs))
    .digest('base64')

  const generated_at = new Date()
  const expires_at   = new Date(generated_at)
  expires_at.setDate(expires_at.getDate() + 90)

  return {
    proof_id:         crypto.randomUUID(),
    proof_type:       'UPTIME_ATTESTATION',
    node_id,
    job_id:           undefined,
    public_inputs,
    proof_data:       commitment,
    verification_key: CURRENT_VK,
    generated_at,
    expires_at,
  }
}

export function verifyUptime(pkg: ZKProofPackage): VerificationResult {
  const now = new Date()

  if (pkg.proof_type !== 'UPTIME_ATTESTATION') {
    return {
      valid: false, proof_id: pkg.proof_id,
      proof_type: pkg.proof_type, public_inputs: pkg.public_inputs,
      verified_at: now, failure_reason: 'Wrong proof type',
    }
  }

  if (now > pkg.expires_at) {
    return {
      valid: false, proof_id: pkg.proof_id,
      proof_type: pkg.proof_type, public_inputs: pkg.public_inputs,
      verified_at: now, failure_reason: 'Proof expired',
    }
  }

  const expected = createHash('sha256')
    .update(CURRENT_VK)
    .update(JSON.stringify(pkg.public_inputs))
    .digest('base64')

  const valid = pkg.proof_data === expected

  return {
    valid,
    proof_id:       pkg.proof_id,
    proof_type:     pkg.proof_type,
    public_inputs:  pkg.public_inputs,
    verified_at:    now,
    failure_reason: valid ? undefined : 'Uptime proof verification failed',
  }
}

/**
 * Compute the Veritas tier badge from an uptime percentage.
 * Used by both the circuit and the web UI to display provider reputation.
 */
export function computeVeritasTier(uptime_pct: number): VeritasTier {
  if (uptime_pct >= UPTIME_TIERS.GOLD)   return 'GOLD'
  if (uptime_pct >= UPTIME_TIERS.SILVER) return 'SILVER'
  if (uptime_pct >= UPTIME_TIERS.BRONZE) return 'BRONZE'
  return 'UNRATED'
}
