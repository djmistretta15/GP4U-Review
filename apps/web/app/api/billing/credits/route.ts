/**
 * GET  /api/billing/credits — Credit balance + transaction history
 * POST /api/billing/credits — Add compute credits
 *
 * Credit balance is derived from the Obsidian ledger:
 *   balance = sum(CREDITS_ADDED amounts) − sum(Job actual_cost)
 *
 * This means every dollar in and out is traceable from first principles.
 * There is no separate "balance" field — the ledger IS the source of truth.
 *
 * POST body: { amount: number }   // USD, min $10, max $10,000
 * Requires: Stripe payment confirmed before calling this endpoint.
 *           (In production: Stripe webhook fires → calls this route.)
 *
 * Rate limit: 10 credit additions per hour per user (anti-fraud).
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth, rateLimit } from '@/lib/auth-guard'
import crypto from 'crypto'

// ─── GET: Balance + transaction history ───────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { user } = auth

  // Sum all credit additions from ledger
  const creditEntries = await prisma.ledgerEntry.findMany({
    where: {
      subject_id: user.id,
      event_type: 'CREDITS_ADDED',
    },
    orderBy: { timestamp: 'desc' },
    take: 100,
  })

  // Sum all job costs
  const jobs = await prisma.job.findMany({
    where:   { userId: user.id },
    select:  { id: true, name: true, status: true, actual_cost: true, costEstimate: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const totalCreditsAdded = creditEntries.reduce((sum, e) => {
    const meta = e.metadata as { amount?: number } | null
    return sum + (meta?.amount ?? 0)
  }, 0)

  const totalSpent = jobs.reduce((sum, j) => {
    const cost = j.actual_cost ?? j.costEstimate
    return sum + (cost ? parseFloat(cost.toString()) : 0)
  }, 0)

  const balance = Math.max(0, totalCreditsAdded - totalSpent)

  // Build unified transaction list
  const transactions = [
    ...creditEntries.map(e => ({
      id:        e.id,
      type:      'credit' as const,
      label:     'Credits added',
      amount:    (e.metadata as { amount?: number } | null)?.amount ?? 0,
      timestamp: e.timestamp.toISOString(),
    })),
    ...jobs
      .filter(j => j.status === 'COMPLETE')
      .map(j => ({
        id:        j.id,
        type:      'spend' as const,
        label:     j.name,
        amount:    -(parseFloat((j.actual_cost ?? j.costEstimate).toString())),
        timestamp: j.createdAt.toISOString(),
      })),
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30)

  return NextResponse.json({
    balance:             parseFloat(balance.toFixed(2)),
    total_credits_added: parseFloat(totalCreditsAdded.toFixed(2)),
    total_spent:         parseFloat(totalSpent.toFixed(2)),
    transactions,
  })
}

// ─── POST: Add credits ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { user } = auth

  // Rate limit: 10 additions per hour per user (anti-fraud / Stripe webhook replay guard)
  const allowed = rateLimit(`credits:${user.id}`, 10, 3600)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many credit requests. Please wait before adding more credits.' },
      { status: 429 }
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { amount, stripe_payment_intent_id } = body as {
    amount?:                    unknown
    stripe_payment_intent_id?:  unknown
  }

  if (typeof amount !== 'number' || !isFinite(amount) || amount < 10 || amount > 10000) {
    return NextResponse.json(
      { error: 'Amount must be between $10 and $10,000' },
      { status: 400 }
    )
  }

  // In production: verify Stripe payment intent is succeeded before crediting.
  // Here we record the intent ID for auditability (Obsidian seals it).
  const paymentRef = typeof stripe_payment_intent_id === 'string'
    ? stripe_payment_intent_id.slice(0, 128)
    : `manual-${Date.now()}`

  // ── Record in Obsidian ledger ─────────────────────────────────────────────
  // Block index: last block + 1 (in production this is atomic + hash-chained)
  const lastEntry = await prisma.ledgerEntry.findFirst({
    orderBy: { block_index: 'desc' },
    select:  { block_index: true, block_hash: true },
  })

  const blockIndex = (lastEntry?.block_index ?? 0) + 1
  const prevHash   = lastEntry?.block_hash ?? '0'.repeat(64)
  const entryId    = `CREDITS-${user.id.slice(-8)}-${blockIndex}`

  const payload = JSON.stringify({
    user_id:    user.id,
    amount,
    payment_ref: paymentRef,
    timestamp:  new Date().toISOString(),
  })

  const payloadHash  = crypto.createHash('sha256').update(payload).digest('hex')
  const blockContent = `${blockIndex}${prevHash}${payloadHash}`
  const blockHash    = crypto.createHash('sha256').update(blockContent).digest('hex')

  const entry = await prisma.ledgerEntry.create({
    data: {
      entry_id:    entryId,
      block_index: blockIndex,
      event_type:  'CREDITS_ADDED',
      severity:    'INFO',
      subject_id:  user.id,
      metadata:    { amount, payment_ref: paymentRef },
      timestamp:   new Date(),
      sequence:    blockIndex,
      prev_hash:   prevHash,
      payload_hash: payloadHash,
      block_hash:  blockHash,
    },
  })

  return NextResponse.json(
    {
      success:       true,
      amount_added:  amount,
      ledger_entry:  entry.entry_id,
      block_index:   entry.block_index,
      message:       `$${amount} in compute credits added. Sealed in Obsidian ledger block #${blockIndex}.`,
    },
    { status: 201 }
  )
}
