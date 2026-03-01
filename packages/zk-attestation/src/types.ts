/**
 * ZK Attestation — Shared Types
 * ==============================
 *
 * GP4U uses zero-knowledge proofs to let providers prove facts about their
 * hardware and behaviour WITHOUT revealing:
 *   - Which customers they served
 *   - The contents of the jobs they ran
 *   - Any data that passed through their node
 *
 * The prover interface below is circuit-agnostic. The production backend
 * will use RISC Zero (https://www.risczero.com) — a zkVM that can prove
 * arbitrary Rust programs. The TypeScript layer here is the integration
 * surface that the web platform and provider agent communicate through.
 *
 * RISC Zero produces a "receipt" containing:
 *   - A STARK proof (the cryptographic proof)
 *   - A journal (the public outputs — what the verifier is allowed to see)
 *
 * The receipt maps to ZKProofPackage below.
 * The journal maps to the circuit-specific PublicInputs types.
 *
 * Circuit versions are pinned by `verification_key` — changing the circuit
 * requires a new key, so old proofs can always be reverified.
 */

export type ProofType =
  | 'HARDWARE_ATTESTATION'
  | 'ENERGY_ATTESTATION'
  | 'UPTIME_ATTESTATION'

export type ProofStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'INVALID'
  | 'EXPIRED'

/**
 * A complete ZK proof package — what gets stored in the ZKProof table
 * and returned to customers/auditors requesting attestation.
 */
export interface ZKProofPackage {
  proof_id:         string
  proof_type:       ProofType
  node_id:          string
  job_id?:          string
  public_inputs:    object     // circuit-specific; defined per circuit below
  proof_data:       string     // base64-encoded STARK proof bytes
  verification_key: string     // circuit version identifier
  generated_at:     Date
  expires_at:       Date       // 90 days from generation
}

/**
 * The result of verifying a ZKProofPackage.
 */
export interface VerificationResult {
  valid:            boolean
  proof_id:         string
  proof_type:       ProofType
  public_inputs:    object
  verified_at:      Date
  failure_reason?:  string
}
