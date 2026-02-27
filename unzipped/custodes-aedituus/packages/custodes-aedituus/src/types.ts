/**
 * CUSTODES AEDITUUS — Core Types
 * Policy Engine, Access Control & Rights Management
 *
 * Aedituus answers one question for every action in the stack:
 * "Is this subject allowed to do THIS SPECIFIC THING right now?"
 *
 * Not "is this user trusted?" — Dextera handles that.
 * Not "did this happen?" — Obsidian handles that.
 * Only: "is this action permitted under current policy?"
 *
 * The engine is policy-as-code: rules are versioned, auditable,
 * and machine-enforceable. No lawyer required for day-to-day decisions.
 *
 * University context: "Can student X use 8x A100s at 2pm on finals week?"
 * Enterprise context: "Can startup Y train on dataset Z under their license tier?"
 * Platform context: "Can this job claim 40GB VRAM on this specific campus node?"
 */

import { ClearanceLevel, SubjectType } from '../../custodes-dextera/src/types'

// ─── Policy Decision ──────────────────────────────────────────────────────────

export enum PolicyDecision {
  ALLOW          = 'ALLOW',
  ALLOW_LIMITED  = 'ALLOW_LIMITED',  // Allowed with constraints applied
  STEP_UP        = 'STEP_UP',        // Requires additional verification
  DENY           = 'DENY',
  DENY_COOLDOWN  = 'DENY_COOLDOWN',  // Denied, retry after cooldown
  REVIEW         = 'REVIEW',         // Route to human review queue
}

export enum DenyReason {
  INSUFFICIENT_CLEARANCE    = 'INSUFFICIENT_CLEARANCE',
  TRUST_SCORE_TOO_LOW       = 'TRUST_SCORE_TOO_LOW',
  RESOURCE_LIMIT_EXCEEDED   = 'RESOURCE_LIMIT_EXCEEDED',
  TIME_WINDOW_BLOCKED       = 'TIME_WINDOW_BLOCKED',
  GEO_RESTRICTION           = 'GEO_RESTRICTION',
  WORKLOAD_TYPE_DENIED      = 'WORKLOAD_TYPE_DENIED',
  INSTITUTION_POLICY        = 'INSTITUTION_POLICY',
  RATE_LIMIT_EXCEEDED       = 'RATE_LIMIT_EXCEEDED',
  ACTIVE_BAN                = 'ACTIVE_BAN',
  POLICY_NOT_FOUND          = 'POLICY_NOT_FOUND',
  RISK_SCORE_TOO_HIGH       = 'RISK_SCORE_TOO_HIGH',
  DATA_RIGHTS_VIOLATION     = 'DATA_RIGHTS_VIOLATION',
  CONCURRENT_JOB_LIMIT      = 'CONCURRENT_JOB_LIMIT',
  SPEND_LIMIT_EXCEEDED      = 'SPEND_LIMIT_EXCEEDED',
}

// ─── Action Types ─────────────────────────────────────────────────────────────

export enum ActionType {
  // Compute
  JOB_SUBMIT         = 'JOB_SUBMIT',
  JOB_CANCEL         = 'JOB_CANCEL',
  GPU_ALLOCATE       = 'GPU_ALLOCATE',
  GPU_PREEMPT        = 'GPU_PREEMPT',

  // Data
  DATA_READ          = 'DATA_READ',
  DATA_WRITE         = 'DATA_WRITE',
  DATA_TRAIN         = 'DATA_TRAIN',
  DATA_EXPORT        = 'DATA_EXPORT',

  // Platform
  BENCHMARK_RUN      = 'BENCHMARK_RUN',
  TUNNEL_OPEN        = 'TUNNEL_OPEN',
  MARKETPLACE_LIST   = 'MARKETPLACE_LIST',

  // Admin
  POLICY_UPDATE      = 'POLICY_UPDATE',
  SUBJECT_BAN        = 'SUBJECT_BAN',
  INSTITUTION_MANAGE = 'INSTITUTION_MANAGE',
  DISPUTE_RESOLVE    = 'DISPUTE_RESOLVE',

  // Billing
  PAYOUT_REQUEST     = 'PAYOUT_REQUEST',
  REFUND_ISSUE       = 'REFUND_ISSUE',
}

// ─── Resource Constraints ─────────────────────────────────────────────────────

/**
 * Constraints that can be applied to a ALLOW_LIMITED decision.
 * The consuming service must enforce all constraints returned.
 */
export interface ResourceConstraints {
  max_vram_gb?: number
  max_gpus?: number
  max_duration_hours?: number
  max_power_watts?: number
  allowed_gpu_tiers?: string[]      // e.g. ['RTX_4090', 'A100_40GB']
  allowed_regions?: string[]
  network_restricted?: boolean      // Block outbound network
  bandwidth_cap_mbps?: number
  max_spend_per_job?: number
  max_concurrent_jobs?: number
  require_audit_logging?: boolean
  workload_types_allowed?: string[]
}

// ─── Policy Rule ──────────────────────────────────────────────────────────────

/**
 * A single policy rule. Rules are evaluated in priority order (lower = higher priority).
 * First matching rule wins.
 *
 * IF (subject matches conditions) AND (action matches) AND (resource matches)
 * THEN decision
 */
export interface PolicyRule {
  rule_id: string
  policy_id: string
  priority: number                  // Lower number = evaluated first

  // Conditions (all must match for rule to apply)
  conditions: PolicyConditions

  // What this rule governs
  action_types: ActionType[]        // Which actions this rule applies to

  // The decision
  decision: PolicyDecision
  constraints?: ResourceConstraints // Applied when decision is ALLOW_LIMITED
  deny_reason?: DenyReason          // Set when decision is DENY*
  step_up_method?: string           // Set when decision is STEP_UP

  // Metadata
  description: string
  created_by: string
  created_at: string
  expires_at?: string               // Rules can have expiry (e.g. finals week blackout)
  is_active: boolean
}

export interface PolicyConditions {
  // Subject conditions
  min_clearance_level?: ClearanceLevel
  min_trust_score?: number
  subject_types?: SubjectType[]
  institution_ids?: string[]        // Empty = all institutions
  org_ids?: string[]
  subject_ids?: string[]            // Specific subject overrides

  // Resource conditions
  gpu_tiers?: string[]
  min_vram_gb?: number
  max_vram_gb?: number
  regions?: string[]
  campus_ids?: string[]

  // Time conditions
  time_windows?: TimeWindow[]       // Empty = always
  days_of_week?: number[]           // 0=Sun, 6=Sat
  blackout_periods?: BlackoutPeriod[]

  // Workload conditions
  workload_types?: string[]
  max_job_duration_hours?: number
  max_gpu_count?: number

  // Financial conditions
  max_spend_per_hour?: number
  max_spend_per_month?: number

  // Risk conditions
  max_risk_score?: number           // From Tutela
}

export interface TimeWindow {
  start_hour: number   // 0–23 UTC
  end_hour: number     // 0–23 UTC
  timezone?: string
}

export interface BlackoutPeriod {
  label: string        // e.g. "Finals Week Spring 2026"
  start: string        // ISO 8601
  end: string          // ISO 8601
  institution_id?: string  // Institution-specific blackout
}

// ─── Policy Set ───────────────────────────────────────────────────────────────

/**
 * A named, versioned collection of rules.
 * Policies are scoped to a domain (platform, institution, org).
 */
export interface Policy {
  policy_id: string
  name: string
  version: string                   // semver e.g. "2.1.0"
  scope: PolicyScope
  scope_id?: string                 // institution_id or org_id
  rules: PolicyRule[]
  default_decision: PolicyDecision  // Fallback if no rule matches
  is_active: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export enum PolicyScope {
  PLATFORM     = 'PLATFORM',     // Global platform policy
  INSTITUTION  = 'INSTITUTION',  // Per-university policy
  ORG          = 'ORG',          // Per-enterprise policy
  SUBJECT      = 'SUBJECT',      // Per-subject override
}

// ─── Authorization Request / Response ────────────────────────────────────────

export interface AuthorizationRequest {
  // Who is asking
  subject_id: string
  clearance_level: ClearanceLevel
  trust_score: number
  subject_type: SubjectType
  institution_id?: string
  org_id?: string
  passport_id: string

  // What they want to do
  action: ActionType
  resource_id?: string
  resource_type?: string

  // Resource details
  requested_vram_gb?: number
  requested_gpu_count?: number
  requested_gpu_tier?: string
  requested_duration_hours?: number
  workload_type?: string
  region?: string
  campus_id?: string
  estimated_cost?: number

  // Context
  current_risk_score?: number      // From Tutela (0–100, lower = safer)
  concurrent_jobs?: number
  monthly_spend_so_far?: number
  ip_address: string
  request_time?: string            // ISO 8601, defaults to now
}

export interface AuthorizationResponse {
  // Core decision
  decision: PolicyDecision
  deny_reason?: DenyReason
  constraints?: ResourceConstraints

  // Traceability
  matched_rule_id?: string
  policy_id: string
  policy_version: string
  evaluation_id: string            // UUID for this specific evaluation
  evaluated_at: string

  // Step-up details
  step_up_method?: string
  step_up_prompt?: string

  // Review details
  review_queue?: string
  review_reason?: string

  // Cooldown details
  retry_after_seconds?: number

  // Human readable
  reason_message: string
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

export interface RateLimitConfig {
  window_seconds: number
  max_requests: number
  scope: 'SUBJECT' | 'INSTITUTION' | 'IP'
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  reset_at: string
  retry_after_seconds?: number
}

// ─── Service Config ───────────────────────────────────────────────────────────

export interface AedituusConfig {
  instance_id: string
  default_policy_id: string        // Fallback policy if no scope match
  cache_ttl_seconds: number        // Policy cache TTL (default: 300)
  rate_limit_configs: RateLimitConfig[]
}
