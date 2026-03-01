/**
 * Appeal Handler
 * ==============
 *
 * Manages the appeal lifecycle for slash events.
 *
 * Rules:
 *   - An appeal must be filed within the appeal window (7 or 14 days).
 *   - Only one appeal per slash event — no re-appeals.
 *   - The provider submits a written statement + optional evidence URLs.
 *   - An admin reviews and either ACCEPTS (stake restored) or REJECTS.
 *   - Both outcomes are written to Obsidian as separate events.
 *   - The original slash entry is NEVER modified.
 *
 * Stake restoration on ACCEPTED appeal:
 *   - Only the slashed amount is restored — not any subsequent slashes.
 *   - The node is un-suspended if the slash was the only suspension trigger.
 *   - Ejected nodes CANNOT appeal back into the network via this system —
 *     ejection reversal requires a super-admin decision (clearance 5).
 */

export interface AppealInput {
  slash_event_id:  string
  slash_id:        string
  filed_by:        string    // node owner user_id
  statement:       string    // provider's written appeal (max 5000 chars)
  evidence_urls:   string[]  // supporting URLs (e.g. monitoring dashboards)
  appeal_deadline: Date
}

export interface AppealValidation {
  valid:   boolean
  reason?: string
}

export interface AppealResolutionInput {
  appeal_id:       string
  slash_event_id:  string
  node_id:         string
  reviewed_by:     string    // admin user_id
  accepted:        boolean
  resolution_note: string
  amount_slashed:  number    // original slash amount, restored if accepted
}

export interface AppealResolutionResult {
  appeal_id:       string
  accepted:        boolean
  amount_restored: number
  ledger_event:    LedgerAppealEvent
}

export interface LedgerAppealEvent {
  event_type: 'SLASH_APPEAL_FILED' | 'SLASH_APPEAL_ACCEPTED' | 'SLASH_APPEAL_REJECTED'
  severity:   'INFO' | 'WARNING'
  subject_id: string
  target_type: 'PROVIDER_NODE'
  metadata: Record<string, unknown>
}

const MAX_STATEMENT_LENGTH = 5000
const MAX_EVIDENCE_URLS    = 10

export function validateAppeal(input: AppealInput): AppealValidation {
  const now = new Date()

  if (now > input.appeal_deadline) {
    return { valid: false, reason: 'Appeal window has expired.' }
  }

  if (!input.statement || input.statement.trim().length < 50) {
    return {
      valid:  false,
      reason: 'Appeal statement must be at least 50 characters.',
    }
  }

  if (input.statement.length > MAX_STATEMENT_LENGTH) {
    return {
      valid:  false,
      reason: `Appeal statement exceeds ${MAX_STATEMENT_LENGTH} character limit.`,
    }
  }

  if (input.evidence_urls.length > MAX_EVIDENCE_URLS) {
    return {
      valid:  false,
      reason: `Maximum ${MAX_EVIDENCE_URLS} evidence URLs allowed.`,
    }
  }

  // Validate each URL is actually a URL
  for (const url of input.evidence_urls) {
    try {
      new URL(url)
    } catch {
      return { valid: false, reason: `Invalid evidence URL: ${url}` }
    }
  }

  return { valid: true }
}

export function buildAppealFiledEvent(input: AppealInput): LedgerAppealEvent {
  return {
    event_type:  'SLASH_APPEAL_FILED',
    severity:    'INFO',
    subject_id:  input.filed_by,
    target_type: 'PROVIDER_NODE',
    metadata: {
      slash_event_id:  input.slash_event_id,
      slash_id:        input.slash_id,
      evidence_url_count: input.evidence_urls.length,
      // statement is NOT stored in the ledger (may contain sensitive info)
      // it is stored in the AppealRecord DB table only
    },
  }
}

export function resolveAppeal(
  input: AppealResolutionInput,
): AppealResolutionResult {
  const amount_restored = input.accepted ? input.amount_slashed : 0

  const ledger_event: LedgerAppealEvent = {
    event_type:  input.accepted ? 'SLASH_APPEAL_ACCEPTED' : 'SLASH_APPEAL_REJECTED',
    severity:    input.accepted ? 'INFO' : 'WARNING',
    subject_id:  input.node_id,
    target_type: 'PROVIDER_NODE',
    metadata: {
      appeal_id:       input.appeal_id,
      slash_event_id:  input.slash_event_id,
      reviewed_by:     input.reviewed_by,
      amount_restored,
      // resolution_note NOT stored in ledger metadata — stored in AppealRecord only
    },
  }

  return {
    appeal_id:       input.appeal_id,
    accepted:        input.accepted,
    amount_restored,
    ledger_event,
  }
}
