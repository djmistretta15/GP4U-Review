/**
 * Ondo Finance RWA Payment Provider — Port Stub
 *
 * Covers: OUSG (tokenised US Treasuries), USDY (yield-bearing stablecoin)
 *
 * Status: PORT STUB — the provider is wired and registered, but
 *         createCharge() will throw until the real Ondo API integration
 *         is built. Enable the toggle (PAYMENT_ONDO_ENABLED=true) only
 *         when the integration is complete.
 *
 * Why build the stub now?
 *   - The interface is locked in — no future refactor needed
 *   - isEnabled() returns false by default, so zero runtime impact
 *   - The UI will show an "Ondo RWA" tab with a "Coming soon" badge
 *   - When the API is ready, replace createCharge() body — done
 *
 * Road-map:
 *   1. Register for Ondo API access at https://ondo.finance
 *   2. Implement createCharge() using Ondo's transfer initiation endpoint
 *   3. Set PAYMENT_ONDO_ENABLED=true in production
 */

import type { PaymentProvider, CreateChargeParams, ChargeResult, WebhookEvent } from '../types'

export class OndoProvider implements PaymentProvider {
  readonly id               = 'ondo' as const
  readonly name             = 'Ondo RWA'
  readonly description      = 'Pay with OUSG or USDY — tokenised real-world assets via Ondo Finance'
  readonly supportedMethods = ['OUSG', 'USDY']
  readonly icon             = '🏛'

  isEnabled(): boolean {
    return process.env.PAYMENT_ONDO_ENABLED === 'true'
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async createCharge(_params: CreateChargeParams): Promise<ChargeResult> {
    throw new Error(
      'Ondo Finance integration is not yet live. ' +
      'Set PAYMENT_ONDO_ENABLED=false or contact team@gp4u.com to join the beta.'
    )
  }

  parseWebhook(_rawBody: string, _headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    // Stub — no webhook support until API integration is complete
    return null
  }
}
