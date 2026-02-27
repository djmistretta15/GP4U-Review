/**
 * CUSTODES AEDITUUS — Default Platform Policies
 *
 * These are the baseline rules that ship with the platform.
 * They are the floor — institutions and orgs can add stricter
 * rules on top, but cannot relax below this baseline.
 *
 * Rule priority guide:
 *   1–99:   Emergency / security overrides
 *   100–199: Institution-specific rules
 *   200–299: Trust band rules
 *   300–399: Resource limit rules
 *   400–499: Time-based rules
 *   500+:    Permissive defaults
 */

import { v4 as uuidv4 } from 'uuid'
import {
  Policy,
  PolicyRule,
  PolicyDecision,
  PolicyScope,
  DenyReason,
  ActionType,
} from './types'
import { ClearanceLevel, SubjectType } from '../../custodes-dextera/src/types'

const now = new Date().toISOString()
const SYSTEM = 'system'

// ─── Platform Baseline Policy ─────────────────────────────────────────────────

export function buildPlatformBaselinePolicy(): Policy {
  const policy_id = 'policy_platform_baseline'

  const rules: PolicyRule[] = [

    // ── Rule 1: Banned subjects — always deny everything ─────────────────────
    // (Actually enforced by Dextera ban check before Aedituus is even called,
    //  but this is a safety net at the policy layer too.)
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     1,
      description:  'Subjects with UNVERIFIED clearance cannot do anything',
      action_types: Object.values(ActionType),
      conditions: {
        min_clearance_level: ClearanceLevel.UNVERIFIED,
        // Match only UNVERIFIED by combining with subject type check
        // (UNVERIFIED = 0, so min_clearance = 0 matches all — we flip: deny if < EMAIL_ONLY)
      },
      decision:     PolicyDecision.DENY,
      deny_reason:  DenyReason.INSUFFICIENT_CLEARANCE,
      is_active:    false, // Handled by Dextera — kept as documentation
      created_by:   SYSTEM,
      created_at:   now,
    },

    // ── Rule 2: Low trust score — restrict to sandboxed inference only ────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     10,
      description:  'Trust score < 30 (RESTRICTED): sandboxed inference only, no training',
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        min_trust_score: 0,
        // This rule catches scores 0–29 by capping at 29
        max_risk_score: 100,
        workload_types: ['INFERENCE'],  // Only inference allowed
        max_vram_gb: 8,
        max_gpu_count: 1,
      },
      decision: PolicyDecision.ALLOW_LIMITED,
      constraints: {
        max_vram_gb:          8,
        max_gpus:             1,
        max_duration_hours:   2,
        max_power_watts:      150,
        network_restricted:   true,
        workload_types_allowed: ['INFERENCE'],
        require_audit_logging: true,
      },
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 3: High Tutela risk score — step up ──────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     15,
      description:  'Tutela risk score > 70: require step-up before job submission',
      action_types: [ActionType.JOB_SUBMIT],
      conditions: {
        max_risk_score: 100,  // Will be overridden: risk > 70 means deny
        min_trust_score: 0,
      },
      decision:        PolicyDecision.STEP_UP,
      step_up_method:  'MFA_REAUTH',
      is_active:       true,
      created_by:      SYSTEM,
      created_at:      now,
    },

    // ── Rule 4: Admin actions — require ADMIN clearance ───────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     20,
      description:  'Admin actions require ADMIN clearance level',
      action_types: [
        ActionType.POLICY_UPDATE,
        ActionType.SUBJECT_BAN,
        ActionType.INSTITUTION_MANAGE,
        ActionType.DISPUTE_RESOLVE,
        ActionType.REFUND_ISSUE,
      ],
      conditions: {
        min_clearance_level: ClearanceLevel.ADMIN,
      },
      decision:   PolicyDecision.ALLOW,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 5: Admin actions — deny non-admins ───────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     21,
      description:  'Non-admins cannot perform admin actions',
      action_types: [
        ActionType.POLICY_UPDATE,
        ActionType.SUBJECT_BAN,
        ActionType.INSTITUTION_MANAGE,
        ActionType.DISPUTE_RESOLVE,
        ActionType.REFUND_ISSUE,
      ],
      conditions: {},
      decision:    PolicyDecision.DENY,
      deny_reason: DenyReason.INSUFFICIENT_CLEARANCE,
      is_active:   true,
      created_by:  SYSTEM,
      created_at:  now,
    },

    // ── Rule 6: Institutional HIGH_CLEARANCE — backbone access ───────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     100,
      description:  'Institutional HIGH_CLEARANCE (81–100): full backbone access',
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        min_clearance_level: ClearanceLevel.INSTITUTIONAL,
        min_trust_score:     81,
      },
      decision:   PolicyDecision.ALLOW,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 7: TRUSTED band — standard marketplace ───────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     200,
      description:  'TRUSTED band (61–80): marketplace access with standard limits',
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        min_clearance_level: ClearanceLevel.EMAIL_ONLY,
        min_trust_score:     61,
      },
      decision: PolicyDecision.ALLOW_LIMITED,
      constraints: {
        max_vram_gb:         80,
        max_gpus:            4,
        max_duration_hours:  72,
        max_power_watts:     350,
        require_audit_logging: true,
      },
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 8: STANDARD band — limited marketplace ───────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     300,
      description:  'STANDARD band (31–60): limited marketplace access',
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        min_clearance_level: ClearanceLevel.EMAIL_ONLY,
        min_trust_score:     31,
      },
      decision: PolicyDecision.ALLOW_LIMITED,
      constraints: {
        max_vram_gb:           24,
        max_gpus:              2,
        max_duration_hours:    24,
        max_power_watts:       250,
        network_restricted:    false,
        require_audit_logging: true,
      },
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 9: Concurrent job limits ─────────────────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     400,
      description:  'Enforce concurrent job limit of 5 for non-institutional subjects',
      action_types: [ActionType.JOB_SUBMIT],
      conditions: {
        min_trust_score: 0,
      },
      decision:    PolicyDecision.DENY,
      deny_reason: DenyReason.CONCURRENT_JOB_LIMIT,
      is_active:   true,
      created_by:  SYSTEM,
      created_at:  now,
    },

    // ── Rule 10: Marketplace listing — email verified required ────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     500,
      description:  'Listing GPUs on marketplace requires EMAIL_ONLY or higher',
      action_types: [ActionType.MARKETPLACE_LIST],
      conditions: {
        min_clearance_level: ClearanceLevel.EMAIL_ONLY,
        min_trust_score:     40,
      },
      decision:   PolicyDecision.ALLOW,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 11: Payout requests — TRUSTED or higher ──────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     500,
      description:  'Payout requests require TRUSTED band (61+)',
      action_types: [ActionType.PAYOUT_REQUEST],
      conditions: {
        min_trust_score: 61,
      },
      decision:   PolicyDecision.ALLOW,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Rule 12: Payout — deny low trust ─────────────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     501,
      description:  'Trust score below 61 cannot request payouts',
      action_types: [ActionType.PAYOUT_REQUEST],
      conditions:   {},
      decision:     PolicyDecision.DENY,
      deny_reason:  DenyReason.TRUST_SCORE_TOO_LOW,
      is_active:    true,
      created_by:   SYSTEM,
      created_at:   now,
    },

  ]

  return {
    policy_id,
    name:             'Platform Baseline Policy',
    version:          '1.0.0',
    scope:            PolicyScope.PLATFORM,
    rules,
    default_decision: PolicyDecision.DENY,
    is_active:        true,
    created_by:       SYSTEM,
    created_at:       now,
    updated_at:       now,
  }
}

// ─── University Template Policy ───────────────────────────────────────────────

export function buildUniversityPolicy(
  institution_id: string,
  institution_name: string,
  options: {
    allow_after_hours_training?: boolean
    max_vram_per_student_gb?: number
    max_concurrent_jobs_per_student?: number
    blackout_dates?: Array<{ label: string; start: string; end: string }>
    priority_research_groups?: string[]  // subject_ids that get elevated access
  } = {}
): Policy {
  const policy_id = `policy_institution_${institution_id}`
  const {
    allow_after_hours_training = true,
    max_vram_per_student_gb    = 40,
    max_concurrent_jobs_per_student = 3,
    blackout_dates = [],
  } = options

  const rules: PolicyRule[] = [

    // ── Blackout periods ─────────────────────────────────────────────────────
    ...(blackout_dates.length > 0 ? [{
      rule_id:      uuidv4(),
      policy_id,
      priority:     50,
      description:  `${institution_name}: block heavy compute during blackout periods`,
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        institution_ids:   [institution_id],
        blackout_periods:  blackout_dates.map(b => ({
          ...b,
          institution_id,
        })),
        min_vram_gb: 8,    // Only block heavy jobs, allow light inference
      },
      decision:    PolicyDecision.DENY,
      deny_reason: DenyReason.TIME_WINDOW_BLOCKED,
      is_active:   true,
      created_by:  SYSTEM,
      created_at:  now,
    }] : []),

    // ── Students: daytime limits ──────────────────────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     110,
      description:  `${institution_name}: students get limited VRAM during business hours`,
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        institution_ids: [institution_id],
        subject_types:   [SubjectType.STUDENT],
        time_windows: [{ start_hour: 9, end_hour: 17 }],  // 9am–5pm UTC
        days_of_week:    [1, 2, 3, 4, 5],                 // Mon–Fri
      },
      decision: PolicyDecision.ALLOW_LIMITED,
      constraints: {
        max_vram_gb:             Math.floor(max_vram_per_student_gb / 2),
        max_gpus:                2,
        max_duration_hours:      8,
        max_power_watts:         200,
        max_concurrent_jobs:     max_concurrent_jobs_per_student,
        require_audit_logging:   true,
      },
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Students: after-hours training ────────────────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     120,
      description:  `${institution_name}: students get full allocation after hours`,
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE],
      conditions: {
        institution_ids: [institution_id],
        subject_types:   [SubjectType.STUDENT],
        // After hours: 5pm–9am
        time_windows: [
          { start_hour: 17, end_hour: 24 },
          { start_hour: 0,  end_hour: 9 },
        ],
      },
      decision: allow_after_hours_training
        ? PolicyDecision.ALLOW_LIMITED
        : PolicyDecision.DENY,
      constraints: allow_after_hours_training ? {
        max_vram_gb:           max_vram_per_student_gb,
        max_gpus:              4,
        max_duration_hours:    12,
        max_power_watts:       250,
        max_concurrent_jobs:   max_concurrent_jobs_per_student,
        require_audit_logging: true,
      } : undefined,
      deny_reason: allow_after_hours_training
        ? undefined
        : DenyReason.INSTITUTION_POLICY,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

    // ── Faculty / Researchers: full access ────────────────────────────────────
    {
      rule_id:      uuidv4(),
      policy_id,
      priority:     130,
      description:  `${institution_name}: faculty and researchers get full institutional access`,
      action_types: [ActionType.JOB_SUBMIT, ActionType.GPU_ALLOCATE, ActionType.BENCHMARK_RUN],
      conditions: {
        institution_ids: [institution_id],
        subject_types:   [SubjectType.FACULTY, SubjectType.RESEARCHER],
        min_trust_score: 60,
      },
      decision:   PolicyDecision.ALLOW,
      is_active:  true,
      created_by: SYSTEM,
      created_at: now,
    },

  ]

  return {
    policy_id,
    name:             `${institution_name} Policy`,
    version:          '1.0.0',
    scope:            PolicyScope.INSTITUTION,
    scope_id:         institution_id,
    rules,
    default_decision: PolicyDecision.DENY,
    is_active:        true,
    created_by:       SYSTEM,
    created_at:       now,
    updated_at:       now,
  }
}
