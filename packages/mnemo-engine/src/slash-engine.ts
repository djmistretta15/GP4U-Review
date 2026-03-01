/**
 * Slash Engine
 * ============
 *
 * Executes a slash decision against a provider's stake. Called by:
 *   - Automated detection systems (Russian-Doll anomaly triggers)
 *   - Admin API routes (manual review decisions)
 *
 * Every slash is written to the Obsidian ledger FIRST, then the stake is
 * deducted. This ensures the audit trail is never dependent on the
 * financial operation succeeding — the record exists regardless.
 *
 * Slash events are NOT reversible in Obsidian. If an appeal succeeds,
 * a SLASH_APPEAL_ACCEPTED entry is written alongside the original, and
 * the stake is restored. The original slash entry remains intact.
 */

import { createHash } from 'crypto'
import { getSlashRule, SlashCondition } from './slash-conditions'

export interface SlashInput {
  node_id:          string
  stake_id:         string
  current_stake:    number    // current stake amount in USD
  condition:        SlashCondition
  evidence_payload: object    // raw evidence — will be hashed, not stored
  evidence_summary: string    // human-readable summary for the ledger
  issued_by:        string    // admin user_id or 'SYSTEM'
}

export interface SlashResult {
  slash_id:        string
  node_id:         string
  condition:       SlashCondition
  severity:        string
  amount_slashed:  number
  new_stake:       number
  pct_slashed:     number
  eject:           boolean
  evidence_hash:   string
  appeal_deadline: Date
  ledger_event:    LedgerSlashEvent
}

export interface LedgerSlashEvent {
  event_type:       'SLASH_ISSUED'
  severity:         'WARNING' | 'HIGH' | 'CRITICAL'
  subject_id:       string    // node_id
  target_type:      'PROVIDER_NODE'
  metadata: {
    condition:       string
    slash_severity:  string
    amount_slashed:  number
    pct_slashed:     number
    new_stake:       number
    eject:           boolean
    evidence_hash:   string
    evidence_summary:string
    issued_by:       string
    appeal_deadline: string
  }
}

/**
 * Compute SHA-256 of the raw evidence object.
 * The hash is stored in the ledger — the raw payload is not.
 * Investigators can verify a payload against the hash if needed.
 */
export function hashEvidence(payload: object): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
}

/**
 * Calculate the slash amount from the provider's current stake.
 * Rounds to 4 decimal places.
 */
export function calculateSlashAmount(
  current_stake: number,
  pct_of_stake: number,
): number {
  return Math.round((current_stake * pct_of_stake / 100) * 10000) / 10000
}

/**
 * Build a slash result from the input.
 * Does NOT write to DB — the API route handles persistence.
 * This keeps the engine pure and testable.
 */
export function buildSlashResult(input: SlashInput): SlashResult {
  const rule          = getSlashRule(input.condition)
  const evidence_hash = hashEvidence(input.evidence_payload)
  const slash_id      = crypto.randomUUID()

  const amount_slashed = rule.severity === 'WARNING'
    ? 0
    : calculateSlashAmount(input.current_stake, rule.pct_of_stake)

  const new_stake = Math.max(0, input.current_stake - amount_slashed)

  const appeal_deadline = new Date()
  appeal_deadline.setDate(appeal_deadline.getDate() + rule.appeal_days)

  // Map slash severity to ledger severity
  const ledger_severity =
    rule.severity === 'WARNING'    ? 'WARNING'  :
    rule.severity === 'SOFT_SLASH' ? 'HIGH'     : 'CRITICAL'

  const ledger_event: LedgerSlashEvent = {
    event_type:  'SLASH_ISSUED',
    severity:    ledger_severity,
    subject_id:  input.node_id,
    target_type: 'PROVIDER_NODE',
    metadata: {
      condition:        input.condition,
      slash_severity:   rule.severity,
      amount_slashed,
      pct_slashed:      rule.pct_of_stake,
      new_stake,
      eject:            rule.eject,
      evidence_hash,
      evidence_summary: input.evidence_summary,
      issued_by:        input.issued_by,
      appeal_deadline:  appeal_deadline.toISOString(),
    },
  }

  return {
    slash_id,
    node_id:        input.node_id,
    condition:      input.condition,
    severity:       rule.severity,
    amount_slashed,
    new_stake,
    pct_slashed:    rule.pct_of_stake,
    eject:          rule.eject,
    evidence_hash,
    appeal_deadline,
    ledger_event,
  }
}

/**
 * Determine whether a provider has accumulated enough warnings
 * to trigger REPEATED_WARNING (3+ warnings in 30 days).
 */
export function shouldEscalateToRepeatedWarning(
  warning_count_last_30d: number,
): boolean {
  return warning_count_last_30d >= 3
}

/**
 * Determine whether a provider has accumulated enough soft slashes
 * to trigger REPEATED_SOFT_SLASH (3+ soft slashes total).
 */
export function shouldEscalateToRepeatedSoftSlash(
  soft_slash_count: number,
): boolean {
  return soft_slash_count >= 3
}
