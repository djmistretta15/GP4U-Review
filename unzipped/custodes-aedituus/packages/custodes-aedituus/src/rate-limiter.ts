/**
 * CUSTODES AEDITUUS — Rate Limiter
 *
 * Token bucket rate limiting for API and action requests.
 * Scoped to subject, institution, or IP.
 * Backed by an atomic counter store (Redis recommended).
 */

import { RateLimitConfig, RateLimitResult } from './types'

// ─── Rate Limit Store Interface ───────────────────────────────────────────────

export interface RateLimitStore {
  /**
   * Increment a counter and return the current value.
   * Sets TTL on first increment.
   * Must be atomic (Redis INCR + EXPIRE or Lua script).
   */
  increment(key: string, window_seconds: number): Promise<{ count: number; ttl_seconds: number }>
  get(key: string): Promise<{ count: number; ttl_seconds: number } | null>
}

// ─── Rate Limiter ─────────────────────────────────────────────────────────────

export class AedituusRateLimiter {
  private store: RateLimitStore
  private configs: RateLimitConfig[]

  constructor(store: RateLimitStore, configs: RateLimitConfig[]) {
    this.store   = store
    this.configs = configs
  }

  /**
   * Check and consume a rate limit token for a given scope.
   * Returns allowed=false if the limit is exceeded.
   */
  async check(params: {
    subject_id: string
    institution_id?: string
    ip_address_hash: string
    action: string
  }): Promise<RateLimitResult> {
    for (const config of this.configs) {
      const key = this.buildKey(config, params)
      const result = await this.store.increment(key, config.window_seconds)

      if (result.count > config.max_requests) {
        const reset_at = new Date(Date.now() + result.ttl_seconds * 1000).toISOString()
        return {
          allowed:               false,
          remaining:             0,
          reset_at,
          retry_after_seconds:   result.ttl_seconds,
        }
      }
    }

    // All limits passed — return most restrictive remaining
    const most_restrictive = await this.getMostRestrictiveRemaining(params)
    return {
      allowed:   true,
      remaining: most_restrictive.remaining,
      reset_at:  most_restrictive.reset_at,
    }
  }

  private buildKey(
    config: RateLimitConfig,
    params: { subject_id: string; institution_id?: string; ip_address_hash: string; action: string }
  ): string {
    switch (config.scope) {
      case 'SUBJECT':     return `ratelimit:subject:${params.subject_id}:${params.action}`
      case 'INSTITUTION': return `ratelimit:institution:${params.institution_id ?? 'none'}:${params.action}`
      case 'IP':          return `ratelimit:ip:${params.ip_address_hash}:${params.action}`
    }
  }

  private async getMostRestrictiveRemaining(params: {
    subject_id: string
    institution_id?: string
    ip_address_hash: string
    action: string
  }): Promise<{ remaining: number; reset_at: string }> {
    let min_remaining = Infinity
    let earliest_reset = new Date(Date.now() + 60000).toISOString()

    for (const config of this.configs) {
      const key = this.buildKey(config, params)
      const result = await this.store.get(key)
      if (result) {
        const remaining = Math.max(0, config.max_requests - result.count)
        if (remaining < min_remaining) {
          min_remaining  = remaining
          earliest_reset = new Date(Date.now() + result.ttl_seconds * 1000).toISOString()
        }
      }
    }

    return {
      remaining: min_remaining === Infinity ? 999 : min_remaining,
      reset_at:  earliest_reset,
    }
  }
}
