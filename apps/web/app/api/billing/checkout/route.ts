/**
 * POST /api/billing/checkout — Create Stripe PaymentIntent
 *
 * Creates a Stripe PaymentIntent for adding compute credits.
 * Returns a client_secret the frontend uses to confirm payment via Stripe.js.
 *
 * Flow:
 *   1. Customer clicks "Add Credits" → calls this endpoint
 *   2. Frontend receives client_secret → renders Stripe Elements
 *   3. Customer completes payment → Stripe fires payment_intent.succeeded webhook
 *   4. Webhook handler at /api/billing/webhook credits the account
 *
 * The credit is NEVER applied here — only the webhook does that.
 * This prevents the "free credits" vulnerability where calling POST /api/billing/credits
 * directly bypassed payment.
 *
 * Rate limit: 20 checkout attempts per hour per user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'
import { rateLimit } from '@/lib/rate-limit'
import { getStripe } from '@/lib/stripe'

// Amount constraints (USD)
const MIN_USD = 10
const MAX_USD = 10_000

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { user } = auth

  const rl = await rateLimit(`checkout:user:${user.id}`, 20, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many checkout attempts' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { amount_usd } = body as { amount_usd?: unknown }

  if (
    typeof amount_usd !== 'number' ||
    !isFinite(amount_usd) ||
    amount_usd < MIN_USD ||
    amount_usd > MAX_USD
  ) {
    return NextResponse.json(
      { error: `Amount must be between $${MIN_USD} and $${MAX_USD.toLocaleString()}` },
      { status: 400 }
    )
  }

  const stripe = getStripe()

  // Amount in cents (Stripe uses smallest currency unit)
  const amount_cents = Math.round(amount_usd * 100)

  const intent = await stripe.paymentIntents.create({
    amount:   amount_cents,
    currency: 'usd',
    metadata: {
      gp4u_user_id:  user.id,
      gp4u_email:    user.email,
      amount_usd:    String(amount_usd),
      purpose:       'compute_credits',
    },
    description:          `GP4U compute credits — $${amount_usd} — ${user.email}`,
    receipt_email:        user.email,
    automatic_payment_methods: { enabled: true },
  })

  return NextResponse.json({
    client_secret:       intent.client_secret,
    payment_intent_id:   intent.id,
    amount_usd,
  })
}
