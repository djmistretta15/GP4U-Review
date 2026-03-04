/**
 * Payment Provider Registry
 *
 * Single source of truth for which payment methods are available.
 * Each provider self-reports isEnabled() based on its required env vars.
 *
 * Feature flags — all default to disabled, opt-in via env:
 *   PAYMENT_STRIPE_ENABLED=true          cards, Apple Pay, Google Pay (default: true if STRIPE_SECRET_KEY set)
 *   PAYMENT_CRYPTO_ENABLED=true          Coinbase Commerce — BTC, ETH, SOL, XRP, USDC
 *   PAYMENT_ONDO_ENABLED=true            Ondo Finance RWA — OUSG, USDY (port stub)
 *   PAYMENT_SOLANA_PAY_ENABLED=true      Direct Solana Pay QR (port stub)
 *
 * Usage:
 *   import { registry } from '@/lib/payments/registry'
 *   const providers = registry.enabled()           // all active providers
 *   const stripe    = registry.get('stripe')       // specific provider
 */

import type { PaymentProvider, ProviderId } from './types'
import { StripeProvider }          from './providers/stripe'
import { CoinbaseCommerceProvider } from './providers/coinbase-commerce'
import { OndoProvider }            from './providers/ondo'
import { SolanaPayProvider }       from './providers/solana-pay'

// ─── All registered providers (order = display order in UI) ──────────────────

const ALL_PROVIDERS: PaymentProvider[] = [
  new StripeProvider(),
  new CoinbaseCommerceProvider(),
  new OndoProvider(),
  new SolanaPayProvider(),
]

// ─── Registry ─────────────────────────────────────────────────────────────────

export const registry = {
  /** All providers, enabled or not */
  all(): PaymentProvider[] {
    return ALL_PROVIDERS
  },

  /** Only providers that are currently enabled */
  enabled(): PaymentProvider[] {
    return ALL_PROVIDERS.filter(p => p.isEnabled())
  },

  /** Get a specific provider by ID */
  get(id: ProviderId): PaymentProvider | undefined {
    return ALL_PROVIDERS.find(p => p.id === id)
  },

  /** Get a provider by ID and assert it's enabled */
  getEnabled(id: ProviderId): PaymentProvider | null {
    const p = this.get(id)
    return p?.isEnabled() ? p : null
  },
}

// ─── Provider summary (for the billing page API) ──────────────────────────────

export interface ProviderSummary {
  id:               ProviderId
  name:             string
  description:      string
  supportedMethods: string[]
  icon:             string
  enabled:          boolean
}

export function getProviderSummaries(): ProviderSummary[] {
  return ALL_PROVIDERS.map(p => ({
    id:               p.id,
    name:             p.name,
    description:      p.description,
    supportedMethods: p.supportedMethods,
    icon:             p.icon,
    enabled:          p.isEnabled(),
  }))
}
