/**
 * Universal ZK Proof Verifier
 * ============================
 *
 * Single entry point for verifying any GP4U ZK proof type.
 * Routes to the appropriate circuit verifier based on proof_type.
 *
 * In production this will call the RISC Zero on-chain verifier contract
 * or the Bonsai verify API. The interface is the same regardless.
 */

import { ZKProofPackage, VerificationResult } from './types'
import { verifyHardware } from './circuits/hardware-attestation'
import { verifyEnergy }   from './circuits/energy-attestation'
import { verifyUptime }   from './circuits/uptime-attestation'

/**
 * Verify any ZK proof package.
 * For HARDWARE_ATTESTATION, the node_secret is required (held by the node).
 */
export function verifyProof(
  pkg: ZKProofPackage,
  options?: { node_secret?: string },
): VerificationResult {
  switch (pkg.proof_type) {
    case 'HARDWARE_ATTESTATION':
      return verifyHardware(pkg, options?.node_secret ?? '')

    case 'ENERGY_ATTESTATION':
      return verifyEnergy(pkg)

    case 'UPTIME_ATTESTATION':
      return verifyUptime(pkg)

    default:
      return {
        valid:          false,
        proof_id:       (pkg as ZKProofPackage).proof_id,
        proof_type:     (pkg as ZKProofPackage).proof_type,
        public_inputs:  (pkg as ZKProofPackage).public_inputs,
        verified_at:    new Date(),
        failure_reason: `Unknown proof type: ${(pkg as ZKProofPackage).proof_type}`,
      }
  }
}
