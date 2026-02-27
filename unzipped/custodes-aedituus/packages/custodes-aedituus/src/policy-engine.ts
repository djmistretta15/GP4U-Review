/**
 * CUSTODES AEDITUUS — Policy Engine
 *
 * Evaluates authorization requests against versioned policy rules.
 * Rules are evaluated in priority order. First match wins.
 *
 * The engine is deterministic — same inputs always produce same output.
 * Every evaluation is logged to Obsidian for full auditability.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  Policy,
  PolicyRule,
  PolicyDecision,
  PolicyScope,
  DenyReason,
  ActionType,
  AuthorizationRequest,
  AuthorizationResponse,
  ResourceConstraints,
  BlackoutPeriod,
  TimeWindow,
  AedituusConfig,
} from './types'

// ─── Policy Store Interface ───────────────────────────────────────────────────

export interface PolicyStore {
  getPlatformPolicy(): Promise<Policy | null>
  getInstitutionPolicy(institution_id: string): Promise<Policy | null>
  getOrgPolicy(org_id: string): Promise<Policy | null>
  getSubjectPolicy(subject_id: string): Promise<Policy | null>
  savePolicy(policy: Policy): Promise<void>
  getPolicyVersion(policy_id: string, version: string): Promise<Policy | null>
  listPolicies(scope?: PolicyScope): Promise<Policy[]>
}

// ─── Policy Engine ────────────────────────────────────────────────────────────

export class AedituusPolicyEngine {
  private config: AedituusConfig
  private store: PolicyStore
  private policyCache: Map<string, { policy: Policy; cached_at: number }> = new Map()

  constructor(config: AedituusConfig, store: PolicyStore) {
    this.config = config
    this.store = store
  }

  /**
   * Evaluate an authorization request.
   * This is the single entry point for all access control decisions.
   *
   * Evaluation order:
   *   1. Subject-level policy (highest specificity)
   *   2. Institution policy
   *   3. Org policy
   *   4. Platform policy (global)
   *   5. Default deny
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const evaluation_id = uuidv4()
    const request_time = request.request_time
      ? new Date(request.request_time)
      : new Date()

    // Load applicable policies in specificity order
    const policies = await this.loadPoliciesForRequest(request)

    // Evaluate each policy's rules in priority order
    for (const policy of policies) {
      const result = this.evaluatePolicy(policy, request, request_time)
      if (result) {
        return {
          ...result,
          policy_id: policy.policy_id,
          policy_version: policy.version,
          evaluation_id,
          evaluated_at: request_time.toISOString(),
        }
      }
    }

    // No rule matched — default deny
    return {
      decision: PolicyDecision.DENY,
      deny_reason: DenyReason.POLICY_NOT_FOUND,
      policy_id: 'default',
      policy_version: '0',
      evaluation_id,
      evaluated_at: request_time.toISOString(),
      reason_message: 'No policy found for this request. Access denied by default.',
    }
  }

  /**
   * Evaluate a single policy against a request.
   * Returns a response if a rule matches, null if no rule applies.
   */
  private evaluatePolicy(
    policy: Policy,
    request: AuthorizationRequest,
    request_time: Date
  ): Omit<AuthorizationResponse, 'policy_id' | 'policy_version' | 'evaluation_id' | 'evaluated_at'> | null {
    // Sort rules by priority (ascending — lower number = higher priority)
    const sorted_rules = [...policy.rules]
      .filter(r => r.is_active)
      .filter(r => !r.expires_at || new Date(r.expires_at) > request_time)
      .sort((a, b) => a.priority - b.priority)

    for (const rule of sorted_rules) {
      if (this.ruleMatches(rule, request, request_time)) {
        return this.buildResponse(rule, request)
      }
    }

    // No rule matched — apply default decision
    if (policy.default_decision === PolicyDecision.DENY) {
      return {
        decision: PolicyDecision.DENY,
        deny_reason: DenyReason.POLICY_NOT_FOUND,
        matched_rule_id: undefined,
        reason_message: `No matching rule in policy ${policy.name}. Default: DENY.`,
      }
    }

    return null  // Let next policy try
  }

  /**
   * Test if a single rule matches the request.
   * All conditions must pass for a match.
   */
  private ruleMatches(
    rule: PolicyRule,
    request: AuthorizationRequest,
    request_time: Date
  ): boolean {
    const c = rule.conditions

    // Action must be in rule's action list
    if (!rule.action_types.includes(request.action)) return false

    // ── Subject conditions ─────────────────────────────────────────────────

    if (c.min_clearance_level !== undefined &&
        request.clearance_level < c.min_clearance_level) return false

    if (c.min_trust_score !== undefined &&
        request.trust_score < c.min_trust_score) return false

    if (c.subject_types?.length &&
        !c.subject_types.includes(request.subject_type)) return false

    if (c.institution_ids?.length &&
        (!request.institution_id || !c.institution_ids.includes(request.institution_id))) return false

    if (c.org_ids?.length &&
        (!request.org_id || !c.org_ids.includes(request.org_id))) return false

    if (c.subject_ids?.length &&
        !c.subject_ids.includes(request.subject_id)) return false

    // ── Resource conditions ────────────────────────────────────────────────

    if (c.min_vram_gb !== undefined &&
        (request.requested_vram_gb ?? 0) < c.min_vram_gb) return false

    if (c.max_vram_gb !== undefined &&
        (request.requested_vram_gb ?? 0) > c.max_vram_gb) return false

    if (c.gpu_tiers?.length &&
        (!request.requested_gpu_tier || !c.gpu_tiers.includes(request.requested_gpu_tier))) return false

    if (c.regions?.length &&
        (!request.region || !c.regions.includes(request.region))) return false

    if (c.campus_ids?.length &&
        (!request.campus_id || !c.campus_ids.includes(request.campus_id))) return false

    if (c.max_gpu_count !== undefined &&
        (request.requested_gpu_count ?? 0) > c.max_gpu_count) return false

    if (c.max_job_duration_hours !== undefined &&
        (request.requested_duration_hours ?? 0) > c.max_job_duration_hours) return false

    if (c.workload_types?.length &&
        (!request.workload_type || !c.workload_types.includes(request.workload_type))) return false

    // ── Financial conditions ───────────────────────────────────────────────

    if (c.max_spend_per_hour !== undefined &&
        (request.estimated_cost ?? 0) > c.max_spend_per_hour) return false

    if (c.max_spend_per_month !== undefined &&
        (request.monthly_spend_so_far ?? 0) > c.max_spend_per_month) return false

    // ── Risk conditions ────────────────────────────────────────────────────

    if (c.max_risk_score !== undefined &&
        (request.current_risk_score ?? 0) > c.max_risk_score) return false

    // ── Time conditions ────────────────────────────────────────────────────

    if (c.days_of_week?.length &&
        !c.days_of_week.includes(request_time.getUTCDay())) return false

    if (c.time_windows?.length &&
        !this.isInTimeWindow(request_time, c.time_windows)) return false

    if (c.blackout_periods?.length &&
        this.isInBlackout(request_time, request.institution_id, c.blackout_periods)) return false

    return true
  }

  private buildResponse(
    rule: PolicyRule,
    request: AuthorizationRequest
  ): Omit<AuthorizationResponse, 'policy_id' | 'policy_version' | 'evaluation_id' | 'evaluated_at'> {
    const base = {
      decision:        rule.decision,
      matched_rule_id: rule.rule_id,
    }

    switch (rule.decision) {
      case PolicyDecision.ALLOW:
        return {
          ...base,
          reason_message: `Allowed by rule: ${rule.description}`,
        }

      case PolicyDecision.ALLOW_LIMITED:
        return {
          ...base,
          constraints:    rule.constraints,
          reason_message: `Allowed with constraints by rule: ${rule.description}`,
        }

      case PolicyDecision.DENY:
      case PolicyDecision.DENY_COOLDOWN:
        return {
          ...base,
          deny_reason:          rule.deny_reason ?? DenyReason.POLICY_NOT_FOUND,
          retry_after_seconds:  rule.decision === PolicyDecision.DENY_COOLDOWN ? 300 : undefined,
          reason_message:       `Denied by rule: ${rule.description}`,
        }

      case PolicyDecision.STEP_UP:
        return {
          ...base,
          step_up_method: rule.step_up_method ?? 'MFA',
          step_up_prompt: 'Additional verification required for this action.',
          reason_message: `Step-up required by rule: ${rule.description}`,
        }

      case PolicyDecision.REVIEW:
        return {
          ...base,
          review_queue:  `review.${request.institution_id ?? 'platform'}`,
          review_reason: rule.description,
          reason_message: `Routed to human review by rule: ${rule.description}`,
        }

      default:
        return { ...base, reason_message: rule.description }
    }
  }

  // ─── Time Helpers ──────────────────────────────────────────────────────────

  private isInTimeWindow(time: Date, windows: TimeWindow[]): boolean {
    const hour = time.getUTCHours()
    return windows.some(w => {
      if (w.start_hour <= w.end_hour) {
        return hour >= w.start_hour && hour < w.end_hour
      }
      // Overnight window (e.g. 22:00–06:00)
      return hour >= w.start_hour || hour < w.end_hour
    })
  }

  private isInBlackout(
    time: Date,
    institution_id: string | undefined,
    periods: BlackoutPeriod[]
  ): boolean {
    return periods.some(p => {
      // Skip institution-specific blackouts that don't apply
      if (p.institution_id && p.institution_id !== institution_id) return false
      const start = new Date(p.start)
      const end   = new Date(p.end)
      return time >= start && time <= end
    })
  }

  // ─── Policy Loading ────────────────────────────────────────────────────────

  private async loadPoliciesForRequest(request: AuthorizationRequest): Promise<Policy[]> {
    const policies: Policy[] = []

    // Subject policy (most specific)
    const subjectPolicy = await this.getCachedPolicy(
      `subject:${request.subject_id}`,
      () => this.store.getSubjectPolicy(request.subject_id)
    )
    if (subjectPolicy) policies.push(subjectPolicy)

    // Institution policy
    if (request.institution_id) {
      const instPolicy = await this.getCachedPolicy(
        `institution:${request.institution_id}`,
        () => this.store.getInstitutionPolicy(request.institution_id!)
      )
      if (instPolicy) policies.push(instPolicy)
    }

    // Org policy
    if (request.org_id) {
      const orgPolicy = await this.getCachedPolicy(
        `org:${request.org_id}`,
        () => this.store.getOrgPolicy(request.org_id!)
      )
      if (orgPolicy) policies.push(orgPolicy)
    }

    // Platform policy (global fallback)
    const platformPolicy = await this.getCachedPolicy(
      'platform',
      () => this.store.getPlatformPolicy()
    )
    if (platformPolicy) policies.push(platformPolicy)

    return policies
  }

  private async getCachedPolicy(
    key: string,
    loader: () => Promise<Policy | null>
  ): Promise<Policy | null> {
    const cached = this.policyCache.get(key)
    const now    = Date.now()
    const ttl_ms = this.config.cache_ttl_seconds * 1000

    if (cached && (now - cached.cached_at) < ttl_ms) {
      return cached.policy
    }

    const policy = await loader()
    if (policy) {
      this.policyCache.set(key, { policy, cached_at: now })
    }
    return policy
  }

  /**
   * Invalidate the policy cache (call after policy updates).
   */
  invalidateCache(scope_key?: string): void {
    if (scope_key) {
      this.policyCache.delete(scope_key)
    } else {
      this.policyCache.clear()
    }
  }
}
