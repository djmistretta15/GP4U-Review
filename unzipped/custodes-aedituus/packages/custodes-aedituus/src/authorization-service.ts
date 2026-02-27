/**
 * CUSTODES AEDITUUS — Authorization Service
 *
 * The single entry point all other modules call for access control.
 * Combines:
 *   - Policy engine (rule evaluation)
 *   - Rate limiting (velocity checks)
 *   - Obsidian logging (every decision recorded)
 *
 * Usage from any pillar or chamber:
 *   const result = await aedituus.authorize(request)
 *   if (result.decision !== PolicyDecision.ALLOW &&
 *       result.decision !== PolicyDecision.ALLOW_LIMITED) {
 *     throw new Error(result.reason_message)
 *   }
 *   // Apply result.constraints if ALLOW_LIMITED
 */

import {
  AuthorizationRequest,
  AuthorizationResponse,
  PolicyDecision,
  DenyReason,
  RateLimitConfig,
  AedituusConfig,
} from './types'
import { AedituusPolicyEngine, PolicyStore } from './policy-engine'
import { AedituusRateLimiter, RateLimitStore } from './rate-limiter'

// ─── Obsidian Sink Interface (avoid circular dep — use minimal interface) ────

export interface AedituusObsidianSink {
  emitPolicyDecision(params: {
    subject_id:      string
    passport_id:     string
    action:          string
    decision:        string
    policy_id:       string
    policy_version:  string
    evaluation_id:   string
    deny_reason?:    string
    matched_rule_id?: string
    ip_address:      string
    institution_id?: string
    metadata:        Record<string, unknown>
  }): Promise<void>
}

// ─── Authorization Service ────────────────────────────────────────────────────

export class AedituusAuthorizationService {
  private engine:  AedituusPolicyEngine
  private limiter: AedituusRateLimiter
  private obsidian: AedituusObsidianSink

  constructor(
    config:       AedituusConfig,
    policyStore:  PolicyStore,
    rateLimitStore: RateLimitStore,
    obsidian:     AedituusObsidianSink
  ) {
    this.engine  = new AedituusPolicyEngine(config, policyStore)
    this.limiter = new AedituusRateLimiter(rateLimitStore, config.rate_limit_configs)
    this.obsidian = obsidian
  }

  /**
   * Primary authorization method.
   * Call this from every pillar and chamber before any privileged operation.
   */
  async authorize(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    // 1. Rate limit check (fast, before policy evaluation)
    const rateResult = await this.limiter.check({
      subject_id:      request.subject_id,
      institution_id:  request.institution_id,
      ip_address_hash: this.hashIP(request.ip_address),
      action:          request.action,
    })

    if (!rateResult.allowed) {
      const response: AuthorizationResponse = {
        decision:              PolicyDecision.DENY_COOLDOWN,
        deny_reason:           DenyReason.RATE_LIMIT_EXCEEDED,
        policy_id:             'rate-limiter',
        policy_version:        '1.0.0',
        evaluation_id:         `rl_${Date.now()}`,
        evaluated_at:          new Date().toISOString(),
        retry_after_seconds:   rateResult.retry_after_seconds,
        reason_message:        `Rate limit exceeded. Retry after ${rateResult.retry_after_seconds}s.`,
      }
      await this.logDecision(request, response)
      return response
    }

    // 2. Policy engine evaluation
    const response = await this.engine.authorize(request)

    // 3. Log every decision to Obsidian (non-blocking)
    this.logDecision(request, response).catch(console.error)

    return response
  }

  /**
   * Convenience: authorize and throw if not allowed.
   * Use this in service methods that should fail fast on denial.
   */
  async authorizeOrThrow(request: AuthorizationRequest): Promise<AuthorizationResponse> {
    const result = await this.authorize(request)
    if (
      result.decision !== PolicyDecision.ALLOW &&
      result.decision !== PolicyDecision.ALLOW_LIMITED
    ) {
      const err = new AedituusAuthorizationError(result)
      throw err
    }
    return result
  }

  /**
   * Batch authorize multiple actions for the same subject.
   * Used for UI permission checks (show/hide features).
   */
  async authorizeMany(
    base_request: Omit<AuthorizationRequest, 'action'>,
    actions: AuthorizationRequest['action'][]
  ): Promise<Record<string, AuthorizationResponse>> {
    const results: Record<string, AuthorizationResponse> = {}
    await Promise.all(
      actions.map(async action => {
        results[action] = await this.authorize({ ...base_request, action })
      })
    )
    return results
  }

  /**
   * Invalidate cached policies for a scope.
   * Call after any policy update.
   */
  invalidatePolicyCache(scope_key?: string): void {
    this.engine.invalidateCache(scope_key)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private async logDecision(
    request: AuthorizationRequest,
    response: AuthorizationResponse
  ): Promise<void> {
    await this.obsidian.emitPolicyDecision({
      subject_id:      request.subject_id,
      passport_id:     request.passport_id,
      action:          request.action,
      decision:        response.decision,
      policy_id:       response.policy_id,
      policy_version:  response.policy_version,
      evaluation_id:   response.evaluation_id,
      deny_reason:     response.deny_reason,
      matched_rule_id: response.matched_rule_id,
      ip_address:      request.ip_address,
      institution_id:  request.institution_id,
      metadata: {
        trust_score:      request.trust_score,
        clearance_level:  request.clearance_level,
        resource_id:      request.resource_id,
        workload_type:    request.workload_type,
        requested_vram:   request.requested_vram_gb,
        constraints:      response.constraints,
      },
    })
  }

  private hashIP(ip: string): string {
    // Simple hash for rate limiting key (full hashing done by Obsidian)
    const { createHash } = require('crypto')
    return createHash('sha256').update(ip).digest('hex').substring(0, 16)
  }
}

// ─── Authorization Error ──────────────────────────────────────────────────────

export class AedituusAuthorizationError extends Error {
  public readonly response: AuthorizationResponse

  constructor(response: AuthorizationResponse) {
    super(response.reason_message)
    this.name     = 'AedituusAuthorizationError'
    this.response = response
  }
}
