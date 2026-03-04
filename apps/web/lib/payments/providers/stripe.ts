/**
 * Stripe Payment Provider
 *
 * Covers: Cards, Apple Pay, Google Pay, Link (Stripe's wallet)
 *
 * This provider wraps the existing Stripe integration for registry
 * participation (isEnabled check, UI summary). The actual checkout
 * flow lives in /api/billing/checkout (Stripe Elements inline).
 *
 * Enabled by default when STRIPE_SECRET_KEY is set.
 * Override with PAYMENT_STRIPE_ENABLED=false to disable.
 */

import type { PaymentProvider, CreateChargeParams, ChargeResult, WebhookEvent } from '../types'
import crypto from 'crypto'

export class StripeProvider implements PaymentProvider {
  readonly id             = 'stripe' as const
  readonly name           = 'Card & Wallet'
  readonly description    = 'Pay with any card, Apple Pay, Google Pay, or Stripe Link'
  readonly supportedMethods = ['Visa', 'Mastercard', 'Amex', 'Apple Pay', 'Google Pay', 'Link']
  readonly icon           = '💳'

  isEnabled(): boolean {
    const explicit = process.env.PAYMENT_STRIPE_ENABLED
    if (explicit === 'false') return false
    return !!process.env.STRIPE_SECRET_KEY
  }

  /**
   * createCharge — not called directly by the checkout route.
   * The existing /api/billing/checkout creates the PaymentIntent inline
   * because Stripe Elements must mount in the same browser session.
   * This implementation exists for interface completeness and testing.
   */
  async createCharge(params: CreateChargeParams): Promise<ChargeResult> {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) throw new Error('STRIPE_SECRET_KEY not set')

    const body = new URLSearchParams({
      amount:   String(Math.round(params.amount_usd * 100)),
      currency: 'usd',
      'metadata[gp4u_user_id]':  params.user_id,
      'metadata[gp4u_email]':    params.user_email,
      'metadata[amount_usd]':    String(params.amount_usd),
      'metadata[purpose]':       'compute_credits',
      'automatic_payment_methods[enabled]': 'true',
      description: params.description,
      receipt_email: params.user_email,
    })

    const res = await fetch('https://api.stripe.com/v1/payment_intents', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(`Stripe error: ${err?.error?.message ?? res.statusText}`)
    }

    const pi = await res.json()

    return {
      charge_id:    pi.id,
      redirect_url: '',          // Stripe uses inline Elements, not a redirect
      metadata:     { client_secret: pi.client_secret },
    }
  }

  /**
   * Verify Stripe-Signature header and parse payment_intent.succeeded events.
   * Returns null for all other event types or invalid signatures.
   */
  parseWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>): WebhookEvent | null {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    if (!secret) return null

    const sigHeader = String(headers['stripe-signature'] ?? '')
    if (!sigHeader) return null

    // Parse t=<ts>,v1=<sig> format
    const parts: Record<string, string[]> = {}
    for (const part of sigHeader.split(',')) {
      const idx = part.indexOf('=')
      if (idx < 0) continue
      const k = part.slice(0, idx)
      const v = part.slice(idx + 1)
      ;(parts[k] ??= []).push(v)
    }

    const timestamp  = parts['t']?.[0]
    const signatures = parts['v1'] ?? []
    if (!timestamp || signatures.length === 0) return null

    // Reject events older than 5 minutes
    if ((Date.now() / 1000) - parseInt(timestamp, 10) > 300) return null

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${rawBody}`, 'utf8')
      .digest('hex')

    const valid = signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
      } catch { return false }
    })

    if (!valid) return null

    let event: { type: string; data: { object: Record<string, unknown> } }
    try { event = JSON.parse(rawBody) } catch { return null }

    if (event.type !== 'payment_intent.succeeded') return null

    const pi       = event.data.object as { id: string; metadata: Record<string, string>; amount: number }
    const userId   = pi.metadata?.gp4u_user_id
    const amountUsd = parseFloat(pi.metadata?.amount_usd ?? '0')

    if (!userId || !amountUsd) return null

    return {
      charge_id:  pi.id,
      status:     'confirmed',
      amount_usd: amountUsd,
      user_id:    userId,
      raw:        event as unknown as Record<string, unknown>,
    }
  }
}
