/**
 * POST /api/billing/webhook — Stripe webhook handler
 *
 * Receives and verifies Stripe events. Only payment_intent.succeeded
 * triggers a credit addition. All other events are acknowledged silently.
 *
 * Security:
 *   - Signature verified with stripe.webhooks.constructEvent (prevents spoofing)
 *   - Idempotency enforced: each payment_intent ID can only be credited once
 *   - Raw body is read before any parsing (Stripe signature requires it)
 *   - This route is in OPEN_ROUTES — Stripe sends from its own IPs, no JWT
 *
 * Configuration:
 *   STRIPE_WEBHOOK_SECRET — from Stripe dashboard → Webhooks → Signing secret
 *   (Use `stripe listen --forward-to localhost:3000/api/billing/webhook` for local dev)
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/db'
import { getStripe } from '@/lib/stripe'

// ─── Stripe signature verification ───────────────────────────────────────────

async function verifyStripeSignature(
  rawBody: string,
  sigHeader: string,
  secret: string,
): Promise<boolean> {
  // Stripe signature format: t=<timestamp>,v1=<sig1>[,v1=<sig2>...]
  const parts: Record<string, string[]> = {}
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx)
    const v = part.slice(idx + 1)
    if (!parts[k]) parts[k] = []
    parts[k].push(v)
  }

  const timestamp = parts['t']?.[0]
  const signatures = parts['v1'] ?? []

  if (!timestamp || signatures.length === 0) return false

  // Reject events older than 5 minutes (replay attack protection)
  const age_s = (Date.now() / 1000) - parseInt(timestamp, 10)
  if (age_s > 300) return false

  const signed_payload = `${timestamp}.${rawBody}`
  const expected = crypto
    .createHmac('sha256', secret)
    .update(signed_payload, 'utf8')
    .digest('hex')

  return signatures.some(sig =>
    crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  )
}

// ─── Credit application (idempotent) ─────────────────────────────────────────

async function applyCredits(paymentIntentId: string, userId: string, amountUsd: number): Promise<void> {
  // Idempotency: check if this payment_intent was already credited
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      event_type: 'CREDITS_ADDED',
      metadata:   { path: ['payment_ref'], equals: paymentIntentId },
    },
  })

  if (existing) {
    console.log(`[webhook] payment_intent ${paymentIntentId} already credited — skipping`)
    return
  }

  // Build hash-chained ledger entry
  const lastEntry = await prisma.ledgerEntry.findFirst({
    orderBy: { block_index: 'desc' },
    select:  { block_index: true, block_hash: true },
  })

  const blockIndex = (lastEntry?.block_index ?? 0) + 1
  const prevHash   = lastEntry?.block_hash ?? '0'.repeat(64)
  const entryId    = `CREDITS-${userId.slice(-8)}-${blockIndex}`

  const payload = JSON.stringify({
    user_id:     userId,
    amount:      amountUsd,
    payment_ref: paymentIntentId,
    source:      'stripe_webhook',
    timestamp:   new Date().toISOString(),
  })

  const payloadHash  = crypto.createHash('sha256').update(payload).digest('hex')
  const blockContent = `${blockIndex}${prevHash}${payloadHash}`
  const blockHash    = crypto.createHash('sha256').update(blockContent).digest('hex')

  await prisma.ledgerEntry.create({
    data: {
      entry_id:     entryId,
      block_index:  blockIndex,
      event_type:   'CREDITS_ADDED',
      severity:     'INFO',
      subject_id:   userId,
      metadata:     { amount: amountUsd, payment_ref: paymentIntentId, source: 'stripe_webhook' },
      timestamp:    new Date(),
      sequence:     blockIndex,
      prev_hash:    prevHash,
      payload_hash: payloadHash,
      block_hash:   blockHash,
    },
  })

  console.log(`[webhook] Credited $${amountUsd} to user ${userId} — block #${blockIndex}`)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const webhook_secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!webhook_secret) {
    console.error('[webhook] STRIPE_WEBHOOK_SECRET not set')
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  // Read raw body (must happen before any .json() call)
  const rawBody = await req.text()

  const valid = await verifyStripeSignature(rawBody, sig, webhook_secret)
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Handle payment_intent.succeeded
  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as {
      id:       string
      metadata: Record<string, string>
      amount:   number
    }

    const userId    = pi.metadata?.gp4u_user_id
    const amountUsd = parseFloat(pi.metadata?.amount_usd ?? '0')

    if (!userId || !amountUsd || amountUsd < 1) {
      console.error('[webhook] payment_intent missing metadata:', pi.id)
      // Return 200 so Stripe doesn't retry — this is a data problem, not a transient error
      return NextResponse.json({ received: true })
    }

    // Verify user still exists
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      console.error('[webhook] user not found:', userId)
      return NextResponse.json({ received: true })
    }

    try {
      await applyCredits(pi.id, userId, amountUsd)
    } catch (err) {
      console.error('[webhook] applyCredits failed:', err)
      // Return 500 so Stripe retries
      return NextResponse.json({ error: 'Internal error applying credits' }, { status: 500 })
    }
  }

  // All other events — acknowledged
  return NextResponse.json({ received: true })
}
