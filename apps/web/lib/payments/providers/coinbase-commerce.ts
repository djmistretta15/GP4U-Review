/**
 * Coinbase Commerce Payment Provider
 *
 * Covers: BTC, ETH, SOL, XRP, USDC (and any coin Coinbase Commerce adds)
 *
 * Flow:
 *   1. POST /api/billing/crypto-checkout → createCharge() → hosted charge URL
 *   2. User pays at hosted.commerce.coinbase.com/pay/<code>
 *   3. Coinbase POSTs to /api/billing/crypto-webhook → parseWebhook()
 *   4. Webhook route applies credits via applyCredits()
 *
 * Enable:
 *   COINBASE_COMMERCE_API_KEY=your_key
 *   COINBASE_COMMERCE_WEBHOOK_SECRET=your_webhook_secret
 *   PAYMENT_CRYPTO_ENABLED=true          (defaults true when API key set)
 *
 * Reference: https://docs.cdp.coinbase.com/commerce/reference
 */

import type { PaymentProvider, CreateChargeParams, ChargeResult, WebhookEvent } from '../types'
import crypto from 'crypto'

const COINBASE_COMMERCE_API = 'https://api.commerce.coinbase.com'
const CC_VERSION            = '2018-03-22'

export class CoinbaseCommerceProvider implements PaymentProvider {
  readonly id               = 'coinbase_commerce' as const
  readonly name             = 'Crypto'
  readonly description      = 'Pay with BTC, ETH, SOL, XRP, USDC, or any supported coin'
  readonly supportedMethods = ['BTC', 'ETH', 'SOL', 'XRP', 'USDC', 'LTC', 'BCH']
  readonly icon             = '₿'

  isEnabled(): boolean {
    const explicit = process.env.PAYMENT_CRYPTO_ENABLED
    if (explicit === 'false') return false
    return !!process.env.COINBASE_COMMERCE_API_KEY
  }

  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    const apiKey = process.env.COINBASE_COMMERCE_API_KEY
    if (!apiKey) throw new Error('COINBASE_COMMERCE_API_KEY not set')

    const res = await fetch(`${COINBASE_COMMERCE_API}/charges`, {
      method: 'POST',
      headers: {
        'X-CC-Api-Key':    apiKey,
        'X-CC-Version':   CC_VERSION,
        'Content-Type':   'application/json',
        'Accept':         'application/json',
      },
      body: JSON.stringify({
        name:         params.description,
        description:  `GP4U compute credits — $${params.amount_usd} for ${params.user_email}`,
        pricing_type: 'fixed_price',
        local_price: {
          amount:   params.amount_usd.toFixed(2),
          currency: 'USD',
        },
        metadata: {
          gp4u_user_id:  params.user_id,
          gp4u_email:    params.user_email,
          amount_usd:    String(params.amount_usd),
          purpose:       'compute_credits',
        },
        redirect_url: params.return_url,
        cancel_url:   params.cancel_url,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`Coinbase Commerce error: ${JSON.stringify(err)}`)
    }

    const body = await res.json()
    const charge = body.data

    return {
      charge_id:    charge.id,
      redirect_url: charge.hosted_url,
      expires_at:   charge.expires_at ? new Date(charge.expires_at) : undefined,
      metadata: {
        code:        charge.code,
        hosted_url:  charge.hosted_url,
      },
    }
  }

  /**
   * Verify X-CC-Webhook-Signature (HMAC-SHA256 of raw body) and parse the event.
   *
   * Relevant event types:
   *   charge:confirmed  → payment fully confirmed → credit account
   *   charge:failed     → payment failed/expired
   *   charge:pending    → payment detected but not confirmed yet (underpaid risk)
   */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET
    if (!secret) return null

    const sigHeader = String(headers['x-cc-webhook-signature'] ?? '')
    if (!sigHeader) return null

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('hex')

    try {
      if (!crypto.timingSafeEqual(Buffer.from(sigHeader, 'hex'), Buffer.from(expected, 'hex'))) {
        return null
      }
    } catch { return null }

    let payload: {
      event: {
        type: string
        data: {
          id:         string
          metadata:   Record<string, string>
          pricing:    Record<string, { amount: string; currency: string }>
          timeline:   { status: string; time: string }[]
        }
      }
    }
    try { payload = JSON.parse(rawBody) } catch { return null }

    const { event } = payload
    const charge    = event.data

    const userId    = charge.metadata?.gp4u_user_id
    const amountUsd = parseFloat(charge.metadata?.amount_usd ?? '0')

    if (!userId || !amountUsd) return null

    // Map Coinbase Commerce event types to our status enum
    const statusMap: Record<string, 'confirmed' | 'pending' | 'failed' | 'overpaid' | 'underpaid'> = {
      'charge:confirmed': 'confirmed',
      'charge:pending':   'pending',
      'charge:failed':    'failed',
      'charge:delayed':   'pending',
      'charge:resolved':  'confirmed',
    }

    const status = statusMap[event.type]
    if (!status) return null   // unknown event type — ignore

    return {
      charge_id:  charge.id,
      status,
      amount_usd: amountUsd,
      user_id:    userId,
      raw:        payload as unknown as Record<string, unknown>,
    }
  }
}
