/**
 * Payment system — public API
 *
 * Usage:
 *   import { registry, getProviderSummaries } from '@/lib/payments'
 */

export { registry, getProviderSummaries }    from './registry'
export type { ProviderSummary }              from './registry'
export type {
  PaymentProvider,
  ProviderId,
  CreateChargeParams,
  ChargeResult,
  WebhookEvent,
  ChargeStatus,
}                                            from './types'
