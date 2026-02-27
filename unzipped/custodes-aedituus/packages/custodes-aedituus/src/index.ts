/**
 * CUSTODES AEDITUUS — Public API
 *
 * Import surface for all other modules:
 *   import { AedituusAuthorizationService, PolicyDecision, ActionType } from '@custodes/aedituus'
 */

// Core types
export type {
  Policy,
  PolicyRule,
  PolicyConditions,
  ResourceConstraints,
  AuthorizationRequest,
  AuthorizationResponse,
  RateLimitConfig,
  RateLimitResult,
  TimeWindow,
  BlackoutPeriod,
  AedituusConfig,
  PolicyStore,
  RateLimitStore,
  AedituusObsidianSink,
} from './types'

export {
  PolicyDecision,
  PolicyScope,
  DenyReason,
  ActionType,
} from './types'

// Services
export { AedituusAuthorizationService, AedituusAuthorizationError } from './authorization-service'
export { AedituusPolicyEngine } from './policy-engine'
export { AedituusRateLimiter } from './rate-limiter'

// Default policies (seed data)
export { buildPlatformBaselinePolicy, buildUniversityPolicy } from './default-policies'
