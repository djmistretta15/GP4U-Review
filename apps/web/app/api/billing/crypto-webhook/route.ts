/**
 * POST /api/billing/crypto-webhook — Unified crypto payment webhook handler
 *
 * Receives and verifies events from crypto payment providers.
 * Each provider self-verifies its webhook via parseWebhook().
 *
 * Currently handles:
 *   - Coinbase Commerce (X-CC-Webhook-Signature header)
 *
 * Security:
 *   - Signature verified by the provider before any state change
 *   - Idempotency: each charge_id can only be credited once
 *   - Raw body is read before any parsing (required for HMAC verification)
 *   - This route is in OPEN_ROUTES — no JWT required
 *   - Only `confirmed` status triggers credit application
 *
 * To add a new crypto provider webhook:
 *   1. Implement parseWebhook() in the provider class
 *   2. Add the provider to the registry
 *   3. Point the provider's webhook URL to this route
 *   The routing logic here requires no changes.
 */

import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma }    from '@/lib/db'
import { registry }  from '@/lib/payments/registry'

// ─── Credit application (idempotent) ─────────────────────────────────────────

async function applyCredits(
  chargeId:  string,
  userId:    string,
  amountUsd: number,
  source:    string,
): Promise<void> {
  // Idempotency: one credit per charge_id
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      event_type: 'CREDITS_ADDED',
      metadata:   { path: ['payment_ref'], equals: chargeId },
    },
  })

  if (existing) {
    console.log(`[crypto-webhook] charge ${chargeId} already credited — skipping`)
    return
  }

  // Hash-chained ledger entry (same structure as Stripe webhook)
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
    payment_ref: chargeId,
    source,
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
      metadata:     { amount: amountUsd, payment_ref: chargeId, source },
      timestamp:    new Date(),
      sequence:     blockIndex,
      prev_hash:    prevHash,
      payload_hash: payloadHash,
      block_hash:   blockHash,
    },
  })

  console.log(`[crypto-webhook] Credited $${amountUsd} to user ${userId} via ${source} — block #${blockIndex}`)
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  // Convert Headers to a plain object for provider parseWebhook()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k] = v })

  // Try each enabled crypto provider until one claims the webhook
  const cryptoProviders = registry.enabled().filter(p => p.id !== 'stripe')

  let parsed = null
  let matchedProvider = 'unknown'

  for (const provider of cryptoProviders) {
    const result = provider.parseWebhook(rawBody, headers)
    if (result !== null) {
      parsed          = result
      matchedProvider = provider.id
      break
    }
  }

  if (!parsed) {
    // No provider claimed it — either bad sig or unrecognised provider
    // Return 200 to avoid retry storms from misconfigured webhooks
    console.warn('[crypto-webhook] No provider claimed webhook — check signatures and enabled providers')
    return NextResponse.json({ received: true, claimed: false })
  }

  const { charge_id, status, amount_usd, user_id } = parsed

  // Only credit on confirmed payments
  if (status !== 'confirmed') {
    console.log(`[crypto-webhook] charge ${charge_id} status=${status} — not crediting (not confirmed)`)
    return NextResponse.json({ received: true, status })
  }

  if (!user_id || amount_usd < 1) {
    console.error(`[crypto-webhook] charge ${charge_id} missing user_id or invalid amount`)
    return NextResponse.json({ received: true })
  }

  // Verify user still exists
  const user = await prisma.user.findUnique({ where: { id: user_id } })
  if (!user) {
    console.error(`[crypto-webhook] user not found: ${user_id}`)
    return NextResponse.json({ received: true })
  }

  try {
    await applyCredits(charge_id, user_id, amount_usd, `${matchedProvider}_webhook`)
  } catch (err) {
    console.error(`[crypto-webhook] applyCredits failed for charge ${charge_id}:`, err)
    // Return 500 so provider retries
    return NextResponse.json({ error: 'Internal error applying credits' }, { status: 500 })
  }

  return NextResponse.json({ received: true, credited: true })
}
