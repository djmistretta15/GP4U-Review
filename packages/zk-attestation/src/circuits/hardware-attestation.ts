/**
 * Circuit: Hardware Attestation
 * ==============================
 *
 * PROVES: A specific job ran on declared hardware (GPU model, VRAM, driver version)
 * WITHOUT REVEALING: The job's weights, inputs, outputs, or customer identity.
 *
 * --- How it works (RISC Zero) ---
 *
 * The provider's agent runs a Rust guest program inside the zkVM that:
 *   1. Reads the GPU hardware report from nvidia-smi / pynvml (private input)
 *   2. Reads the job manifest: declared gpu_model, vram_gb (private input)
 *   3. Reads the job execution log: actual_vram_peak_gb, duration_s (private input)
 *   4. Verifies: actual_gpu_model   === declared_gpu_model
 *   5. Verifies: actual_vram_peak_gb <= declared_vram_gb
 *   6. Commits to the journal (public output):
 *        { job_id, gpu_model, vram_gb, duration_s, timestamp }
 *
 * The journal is what the world sees. The private inputs never leave the node.
 * The STARK proof cryptographically guarantees the guest program ran correctly
 * over SOME private inputs that satisfy the constraints.
 *
 * --- What customers can verify ---
 *   - The job they paid for ran on the GPU model they selected
 *   - The VRAM usage was within the declared allocation
 *   - The job duration matches billing
 *
 * --- Verification key ---
 * The `verification_key` is the hash of the compiled guest program (image_id
 * in RISC Zero terms). It is pinned per release so old proofs stay verifiable.
 *
 * CURRENT_VK is a placeholder — replace with actual image_id from risc0-build.
 */

import { createHash } from 'crypto'
import { ZKProofPackage, VerificationResult } from '../types'

export const CIRCUIT_ID = 'hardware-attestation'
export const CIRCUIT_VERSION = 'v1.0.0'

// Replace with risc0-build image_id when Rust circuit is compiled
export const CURRENT_VK = 'gp4u:hardware-attestation:v1.0.0'

/**
 * What the verifier sees (the ZK journal / public outputs).
 * Everything here is provably correct — no trust required.
 */
export interface HardwarePublicInputs {
  job_id:              string
  node_id:             string
  gpu_model:           string   // e.g. "NVIDIA GeForce RTX 4090"
  vram_declared_gb:    number
  vram_peak_used_gb:   number
  duration_s:          number
  attested_at_epoch:   number   // Unix timestamp
}

/**
 * Private inputs fed into the ZK circuit (never leaves the node).
 * These are the raw hardware readings that the proof is about.
 */
export interface HardwarePrivateInputs {
  nvidia_smi_output:   string   // raw text output of nvidia-smi
  job_manifest_json:   string   // serialized JobManifest
  execution_log_json:  string   // serialized execution summary from job_runner
  node_secret:         string   // node-specific secret to bind proof to node
}

/**
 * Generate a hardware attestation proof.
 *
 * In production: calls the RISC Zero prover (Bonsai API or local prover)
 * passing private_inputs as the guest stdin. Returns the receipt.
 *
 * In this scaffold: produces a deterministic commitment that can be
 * swapped for a real RISC Zero receipt without changing the interface.
 */
export async function proveHardware(
  public_inputs: HardwarePublicInputs,
  private_inputs: HardwarePrivateInputs,
  node_id: string,
  job_id: string,
): Promise<ZKProofPackage> {
  // --- PRODUCTION: Replace this block with RISC Zero Bonsai API call ---
  // const receipt = await bonsaiProve(CURRENT_VK, {
  //   stdin: JSON.stringify({ public_inputs, private_inputs }),
  // })
  // const proof_data = Buffer.from(receipt.inner).toString('base64')
  // --- END PRODUCTION ---

  // Scaffold: deterministic commitment proves the interface is correct
  const commitment = createHash('sha256')
    .update(CURRENT_VK)
    .update(JSON.stringify(public_inputs))
    .update(private_inputs.node_secret)
    .digest('base64')

  const generated_at = new Date()
  const expires_at   = new Date(generated_at)
  expires_at.setDate(expires_at.getDate() + 90)

  return {
    proof_id:         crypto.randomUUID(),
    proof_type:       'HARDWARE_ATTESTATION',
    node_id,
    job_id,
    public_inputs,
    proof_data:       commitment,
    verification_key: CURRENT_VK,
    generated_at,
    expires_at,
  }
}

/**
 * Verify a hardware attestation proof.
 *
 * In production: calls RISC Zero verify() with the receipt + image_id.
 * Then checks that the journal matches the claimed public_inputs.
 *
 * In this scaffold: re-derives the commitment and compares.
 */
export function verifyHardware(
  pkg: ZKProofPackage,
  node_secret: string,
): VerificationResult {
  const now = new Date()

  if (pkg.proof_type !== 'HARDWARE_ATTESTATION') {
    return {
      valid: false, proof_id: pkg.proof_id,
      proof_type: pkg.proof_type, public_inputs: pkg.public_inputs,
      verified_at: now, failure_reason: 'Wrong proof type',
    }
  }

  if (pkg.verification_key !== CURRENT_VK) {
    return {
      valid: false, proof_id: pkg.proof_id,
      proof_type: pkg.proof_type, public_inputs: pkg.public_inputs,
      verified_at: now, failure_reason: `Unknown circuit version: ${pkg.verification_key}`,
    }
  }

  if (now > pkg.expires_at) {
    return {
      valid: false, proof_id: pkg.proof_id,
      proof_type: pkg.proof_type, public_inputs: pkg.public_inputs,
      verified_at: now, failure_reason: 'Proof has expired (> 90 days old)',
    }
  }

  // Scaffold verification — production uses RISC Zero verify()
  const expected = createHash('sha256')
    .update(CURRENT_VK)
    .update(JSON.stringify(pkg.public_inputs))
    .update(node_secret)
    .digest('base64')

  const valid = pkg.proof_data === expected

  return {
    valid,
    proof_id:       pkg.proof_id,
    proof_type:     pkg.proof_type,
    public_inputs:  pkg.public_inputs,
    verified_at:    now,
    failure_reason: valid ? undefined : 'Proof verification failed — data does not match commitment',
  }
}
