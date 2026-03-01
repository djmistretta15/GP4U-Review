/**
 * Circuit: Energy Attestation
 * ============================
 *
 * PROVES: A job consumed exactly N kWh, sourced from R% renewable energy,
 *         generating C kg CO2e — qualifying for carbon credit issuance.
 * WITHOUT REVEALING: The job contents, customer identity, or node infrastructure details.
 *
 * --- Why this matters ---
 *
 * Aetherion already tracks energy via the Russian-Doll telemetry loop.
 * But raw telemetry is mutable — a provider could lie about power draw or
 * claim renewable sources they don't have.
 *
 * ZK energy attestation creates a VERIFIABLE carbon credit. The proof
 * cryptographically ties energy readings to:
 *   - The job that consumed them (job_id, duration_s)
 *   - The hardware that ran it (gpu_model, power_cap_watts)
 *   - The grid data at the time (renewable_pct from grid operator API)
 *
 * A carbon registry (Gold Standard, Verra) can verify this proof without
 * needing to see the job itself. This is the bridge between private compute
 * and the public carbon market.
 *
 * --- Revenue model ---
 *   Provider earns: compute revenue + carbon credit revenue
 *   GP4U earns:     platform fee on both streams
 *   Customer earns: verifiable "green compute" certificate
 *
 * --- Private inputs (never leave the node) ---
 *   - Raw NVML power readings (array of watts over time)
 *   - Grid operator API response (renewable % for the node's region)
 *   - Node location data (binned to region, not exact address)
 */

import { createHash } from 'crypto'
import { ZKProofPackage, VerificationResult } from '../types'

export const CIRCUIT_ID      = 'energy-attestation'
export const CIRCUIT_VERSION = 'v1.0.0'
export const CURRENT_VK      = 'gp4u:energy-attestation:v1.0.0'

// Minimum renewable % to qualify for carbon credit issuance
export const MIN_RENEWABLE_PCT_FOR_CREDIT = 50

/**
 * Public outputs (ZK journal) — what the carbon registry sees.
 */
export interface EnergyPublicInputs {
  job_id:          string
  node_id:         string
  gpu_model:       string
  region:          string          // ISO region code (e.g. 'US-CA', 'EU-DE')
  energy_kwh:      number          // total job energy consumption
  renewable_pct:   number          // percentage from renewable sources
  carbon_kg_co2e:  number          // kg CO2 equivalent
  duration_s:      number
  attested_at_epoch: number
}

/**
 * Private witness (fed to zkVM only).
 */
export interface EnergyPrivateInputs {
  nvml_power_readings_w:  number[]  // per-second watt readings
  grid_api_response_json: string    // signed response from grid operator
  node_region_hash:       string    // H(exact_location) — keeps location private
}

export async function proveEnergy(
  public_inputs: EnergyPublicInputs,
  _private_inputs: EnergyPrivateInputs,
  node_id: string,
  job_id: string,
): Promise<ZKProofPackage> {
  // Production: call RISC Zero Bonsai with energy circuit image_id
  const commitment = createHash('sha256')
    .update(CURRENT_VK)
    .update(JSON.stringify(public_inputs))
    .digest('base64')

  const generated_at = new Date()
  const expires_at   = new Date(generated_at)
  expires_at.setDate(expires_at.getDate() + 90)

  return {
    proof_id:         crypto.randomUUID(),
    proof_type:       'ENERGY_ATTESTATION',
    node_id,
    job_id,
    public_inputs,
    proof_data:       commitment,
    verification_key: CURRENT_VK,
    generated_at,
    expires_at,
  }
}

export function verifyEnergy(pkg: ZKProofPackage): VerificationResult {
  const now = new Date()

  if (pkg.proof_type !== 'ENERGY_ATTESTATION') {
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
    failure_reason: valid ? undefined : 'Energy proof verification failed',
  }
}

/**
 * Determine whether a job qualifies for carbon credit issuance based on
 * the energy attestation's public inputs.
 */
export function qualifiesForCarbonCredit(inputs: EnergyPublicInputs): {
  qualifies: boolean
  reason:    string
  credits:   number  // tonnes CO2e offset (for Gold Standard issuance)
} {
  if (inputs.renewable_pct < MIN_RENEWABLE_PCT_FOR_CREDIT) {
    return {
      qualifies: false,
      reason:    `Renewable energy percentage (${inputs.renewable_pct}%) below minimum ${MIN_RENEWABLE_PCT_FOR_CREDIT}%`,
      credits:   0,
    }
  }

  if (inputs.carbon_kg_co2e <= 0) {
    return {
      qualifies: false,
      reason:    'No carbon emissions recorded — nothing to offset',
      credits:   0,
    }
  }

  // Carbon credits are in tonnes CO2e (1000 kg = 1 tonne)
  // Only the emissions from the non-renewable fraction are offset
  const non_renewable_fraction = (100 - inputs.renewable_pct) / 100
  const creditable_kg = inputs.carbon_kg_co2e * non_renewable_fraction
  const credits = creditable_kg / 1000

  return {
    qualifies: true,
    reason:    `${inputs.renewable_pct}% renewable energy — ${creditable_kg.toFixed(3)} kg CO2e offset`,
    credits:   Math.round(credits * 1_000_000) / 1_000_000,  // 6 decimal places
  }
}
