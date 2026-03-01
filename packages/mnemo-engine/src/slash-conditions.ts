/**
 * Slash Conditions Registry
 * =========================
 *
 * Every slash condition is defined here with:
 *   - severity:    WARNING | SOFT_SLASH | HARD_SLASH
 *   - pct_of_stake: how much of the provider's remaining stake is deducted
 *   - eject:        whether the node is permanently ejected from the network
 *   - description:  human-readable explanation posted to the Obsidian ledger
 *   - appeal_days:  how many days the provider has to file an appeal
 *
 * WARNINGS have no stake deduction — they are logged to Obsidian only.
 * Accumulated WARNINGs count toward REPEATED_WARNING which IS a soft slash.
 *
 * All slash events are immutable once written to Obsidian. Appeals do not
 * erase the slash record — they add a resolution record alongside it.
 * This preserves the integrity of the audit trail.
 */

export type SlashSeverity  = 'WARNING' | 'SOFT_SLASH' | 'HARD_SLASH'
export type SlashCondition =
  // Tier 1 — Warnings
  | 'THERMAL_THROTTLE_EVENT'
  | 'UPTIME_DROP_MINOR'
  | 'TELEMETRY_DELAY'
  // Tier 2 — Soft Slash
  | 'VRAM_OVERCLAIM'
  | 'JOB_DROPPED_UNEXPECTEDLY'
  | 'UPTIME_SLA_BREACH'
  | 'HARDWARE_MISREPRESENTATION'
  | 'REPEATED_WARNING'
  // Tier 3 — Hard Slash
  | 'TELEMETRY_TAMPERING'
  | 'VISIBILITY_BLOCKED'
  | 'UNAUTHORIZED_PROCESS'
  | 'CRYPTO_MINING_DURING_ML_JOB'
  | 'REPEATED_SOFT_SLASH'

export interface SlashRule {
  condition:    SlashCondition
  severity:     SlashSeverity
  pct_of_stake: number          // 0 for warnings; percentage points (0–100)
  eject:        boolean
  description:  string
  appeal_days:  number
}

export const SLASH_RULES: Record<SlashCondition, SlashRule> = {

  // ── Tier 1: Warnings (no stake deduction) ──────────────────────────────────

  THERMAL_THROTTLE_EVENT: {
    condition:    'THERMAL_THROTTLE_EVENT',
    severity:     'WARNING',
    pct_of_stake: 0,
    eject:        false,
    appeal_days:  0,
    description:
      'GPU thermal throttle detected during a job. Hardware appears real but ' +
      'is operating near thermal limits. Provider should improve cooling.',
  },

  UPTIME_DROP_MINOR: {
    condition:    'UPTIME_DROP_MINOR',
    severity:     'WARNING',
    pct_of_stake: 0,
    eject:        false,
    appeal_days:  0,
    description:
      'Uptime dropped for less than 2 hours. Job was handed off gracefully. ' +
      'Logged for pattern detection — no immediate penalty.',
  },

  TELEMETRY_DELAY: {
    condition:    'TELEMETRY_DELAY',
    severity:     'WARNING',
    pct_of_stake: 0,
    eject:        false,
    appeal_days:  0,
    description:
      'Telemetry reporting was delayed more than 60 seconds. Likely a network ' +
      'blip. Logged for monitoring.',
  },

  // ── Tier 2: Soft Slash (10–20% deduction) ─────────────────────────────────

  VRAM_OVERCLAIM: {
    condition:    'VRAM_OVERCLAIM',
    severity:     'SOFT_SLASH',
    pct_of_stake: 15,
    eject:        false,
    appeal_days:  7,
    description:
      'Job consumed more VRAM than the provider declared in their manifest. ' +
      'This misrepresents available capacity and can starve other jobs.',
  },

  JOB_DROPPED_UNEXPECTEDLY: {
    condition:    'JOB_DROPPED_UNEXPECTEDLY',
    severity:     'SOFT_SLASH',
    pct_of_stake: 10,
    eject:        false,
    appeal_days:  7,
    description:
      'Job was terminated without completing and without a proper Tutela handshake. ' +
      'Customer compute was lost. Provider should implement graceful shutdown.',
  },

  UPTIME_SLA_BREACH: {
    condition:    'UPTIME_SLA_BREACH',
    severity:     'SOFT_SLASH',
    pct_of_stake: 10,
    eject:        false,
    appeal_days:  7,
    description:
      'Provider was offline for more than 4 hours without advance notice or ' +
      'proper job handoff. SLA commitments were not met.',
  },

  HARDWARE_MISREPRESENTATION: {
    condition:    'HARDWARE_MISREPRESENTATION',
    severity:     'SOFT_SLASH',
    pct_of_stake: 20,
    eject:        false,
    appeal_days:  7,
    description:
      'Detected hardware specs deviate more than 15% from declared specs. ' +
      'Customers paid for capacity that was not delivered.',
  },

  REPEATED_WARNING: {
    condition:    'REPEATED_WARNING',
    severity:     'SOFT_SLASH',
    pct_of_stake: 10,
    eject:        false,
    appeal_days:  7,
    description:
      'Provider has accumulated 3 or more warnings within a 30-day window. ' +
      'Repeated minor violations indicate systemic reliability problems.',
  },

  // ── Tier 3: Hard Slash (50–100% + ejection) ────────────────────────────────

  TELEMETRY_TAMPERING: {
    condition:    'TELEMETRY_TAMPERING',
    severity:     'HARD_SLASH',
    pct_of_stake: 100,
    eject:        true,
    appeal_days:  14,
    description:
      'Statistical analysis detected that telemetry data was fabricated or ' +
      'manipulated. This is a fundamental breach of the trust contract. ' +
      'The Obsidian ledger has recorded the full evidence hash.',
  },

  VISIBILITY_BLOCKED: {
    condition:    'VISIBILITY_BLOCKED',
    severity:     'HARD_SLASH',
    pct_of_stake: 100,
    eject:        true,
    appeal_days:  14,
    description:
      'Provider deliberately blocked the platform\'s hardware visibility layer ' +
      '— a direct violation of the core Terms & Conditions accepted at onboarding. ' +
      'The transparency requirement IS the security model. No exceptions.',
  },

  UNAUTHORIZED_PROCESS: {
    condition:    'UNAUTHORIZED_PROCESS',
    severity:     'HARD_SLASH',
    pct_of_stake: 75,
    eject:        true,
    appeal_days:  14,
    description:
      'Processes not declared in the job manifest were detected running alongside ' +
      'the customer\'s container. This poses a data exfiltration risk.',
  },

  CRYPTO_MINING_DURING_ML_JOB: {
    condition:    'CRYPTO_MINING_DURING_ML_JOB',
    severity:     'HARD_SLASH',
    pct_of_stake: 100,
    eject:        true,
    appeal_days:  14,
    description:
      'Telemetry pattern matching detected cryptocurrency mining activity during ' +
      'a declared ML/inference workload. Provider was billing for ML compute ' +
      'while diverting GPU cycles to mining. This is fraud.',
  },

  REPEATED_SOFT_SLASH: {
    condition:    'REPEATED_SOFT_SLASH',
    severity:     'HARD_SLASH',
    pct_of_stake: 50,
    eject:        true,
    appeal_days:  14,
    description:
      'Provider has received 3 or more soft slashes. Repeated violations demonstrate ' +
      'an inability or unwillingness to meet platform standards.',
  },
}

export function getSlashRule(condition: SlashCondition): SlashRule {
  const rule = SLASH_RULES[condition]
  if (!rule) throw new Error(`Unknown slash condition: ${condition}`)
  return rule
}
