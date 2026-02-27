/**
 * CUSTODES DEXTERA — Trust Score Engine
 *
 * Computes a 0–100 trust score for any subject.
 * Score determines access tier, friction level, and feature availability
 * across all Custodes pillars and GP4U chambers.
 *
 * Score bands:
 *   0–30:  Restricted (new/suspicious, sandboxed access only)
 *  31–60:  Standard   (normal marketplace access)
 *  61–80:  Trusted    (higher limits, priority queue access)
 *  81–100: High Clearance (institutional backbone, reserved capacity)
 */

import { TrustScoreSignals, TrustScoreResponse } from './types'

// Weight of each signal in the final score (must sum to 1.0)
const WEIGHTS = {
  identity_verified:      0.20,
  mfa_enabled:            0.10,
  device_bound:           0.10,
  institution_verified:   0.20,
  account_age_days:       0.10,
  login_consistency:      0.10,
  no_fraud_flags:         0.10,
  no_abuse_flags:         0.05,
  job_completion_rate:    0.03,
  payment_health:         0.02,
}

// Score thresholds
export const TRUST_BANDS = {
  RESTRICTED:     { min: 0,  max: 30  },
  STANDARD:       { min: 31, max: 60  },
  TRUSTED:        { min: 61, max: 80  },
  HIGH_CLEARANCE: { min: 81, max: 100 },
} as const

export type TrustBand = keyof typeof TRUST_BANDS

export function computeTrustScore(signals: TrustScoreSignals): TrustScoreResponse {
  let raw = 0

  // Binary signals (boolean → 0 or 1)
  raw += (signals.identity_verified   ? 1 : 0) * WEIGHTS.identity_verified   * 100
  raw += (signals.mfa_enabled         ? 1 : 0) * WEIGHTS.mfa_enabled         * 100
  raw += (signals.device_bound        ? 1 : 0) * WEIGHTS.device_bound        * 100
  raw += (signals.institution_verified? 1 : 0) * WEIGHTS.institution_verified* 100
  raw += (signals.no_fraud_flags      ? 1 : 0) * WEIGHTS.no_fraud_flags      * 100
  raw += (signals.no_abuse_flags      ? 1 : 0) * WEIGHTS.no_abuse_flags      * 100

  // Continuous signals (already 0–1)
  raw += signals.login_consistency    * WEIGHTS.login_consistency    * 100
  raw += signals.job_completion_rate  * WEIGHTS.job_completion_rate  * 100
  raw += signals.payment_health       * WEIGHTS.payment_health       * 100

  // Account age: caps at 365 days → maps 0–365 to 0–1
  const age_score = Math.min(signals.account_age_days / 365, 1)
  raw += age_score * WEIGHTS.account_age_days * 100

  // Hard penalties: any fraud flag immediately drops to RESTRICTED band ceiling
  if (!signals.no_fraud_flags) {
    raw = Math.min(raw, 30)
  }

  // Hard penalties: institution verified unlocks HIGH_CLEARANCE floor
  // Without it, max score is 80 (TRUSTED ceiling)
  if (!signals.institution_verified && !signals.no_fraud_flags) {
    raw = Math.min(raw, 80)
  }

  const final_score = Math.round(Math.max(0, Math.min(100, raw)))

  return {
    subject_id: signals.subject_id,
    trust_score: final_score,
    score_breakdown: signals,
    computed_at: new Date().toISOString(),
  }
}

export function getTrustBand(score: number): TrustBand {
  if (score <= 30) return 'RESTRICTED'
  if (score <= 60) return 'STANDARD'
  if (score <= 80) return 'TRUSTED'
  return 'HIGH_CLEARANCE'
}

export function meetsMinimumTrust(score: number, required_band: TrustBand): boolean {
  const band_order: TrustBand[] = ['RESTRICTED', 'STANDARD', 'TRUSTED', 'HIGH_CLEARANCE']
  return band_order.indexOf(getTrustBand(score)) >= band_order.indexOf(required_band)
}
