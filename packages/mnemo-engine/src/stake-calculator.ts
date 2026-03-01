/**
 * Stake Calculator
 * ================
 *
 * Determines the required Mnemo stake for a provider based on their tier.
 *
 * University Tier (UNIVERSITY):
 *   - Zero cash stake. Brand/reputation IS the stake.
 *   - Must provide signed MOU and verified .edu email.
 *   - Traffic weighting earned by uptime — ejection = loss of revenue + public
 *     slash record on the Obsidian ledger. That exposure is sufficient deterrent
 *     for any institution that cares about its reputation.
 *
 * Commercial Tier (COMMERCIAL):
 *   - Cash stake in GP4U credits (USD-pegged 1:1 at launch).
 *   - Per-GPU pricing with volume discount.
 *   - Large operators (17+ GPUs) required to undergo hardware audit.
 *
 * The stake is held in escrow and released when the provider exits cleanly
 * (all jobs complete, no pending slashes, no open appeals).
 */

export type ProviderTier = 'UNIVERSITY' | 'COMMERCIAL'

export interface StakeRequirement {
  tier:             ProviderTier
  gpu_count:        number
  cash_stake_usd:   number    // 0 for universities
  per_gpu_usd:      number
  requires_audit:   boolean
  requires_mou:     boolean   // true for universities
  rationale:        string
}

// Commercial stake tiers (per-GPU pricing with volume discount)
const COMMERCIAL_BRACKETS = [
  { min: 1,  max: 4,  per_gpu_usd: 50 },
  { min: 5,  max: 16, per_gpu_usd: 35 },
  { min: 17, max: Infinity, per_gpu_usd: 25 },  // requires_audit = true
] as const

export function calculateStake(
  tier: ProviderTier,
  gpu_count: number,
): StakeRequirement {
  if (gpu_count < 1) throw new Error('gpu_count must be at least 1')

  if (tier === 'UNIVERSITY') {
    return {
      tier,
      gpu_count,
      cash_stake_usd:  0,
      per_gpu_usd:     0,
      requires_audit:  false,
      requires_mou:    true,
      rationale:
        'University tier uses reputational stake. Public slash events on the ' +
        'Obsidian ledger serve as sufficient deterrent. MOU required.',
    }
  }

  // Commercial tier
  const bracket = COMMERCIAL_BRACKETS.find(
    b => gpu_count >= b.min && gpu_count <= b.max,
  )!

  const cash_stake_usd = gpu_count * bracket.per_gpu_usd
  const requires_audit = gpu_count >= 17

  return {
    tier,
    gpu_count,
    cash_stake_usd,
    per_gpu_usd:    bracket.per_gpu_usd,
    requires_audit,
    requires_mou:   false,
    rationale:
      `${gpu_count} GPU(s) × $${bracket.per_gpu_usd}/GPU = $${cash_stake_usd} stake` +
      (requires_audit ? ' (hardware audit required for 17+ GPU operators)' : ''),
  }
}
