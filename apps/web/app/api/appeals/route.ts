/**
 * POST /api/appeals — File an Appeal Against a Slash Event
 *
 * Provider submits a written statement + optional evidence URLs.
 * Validates: appeal window open, no existing appeal, statement length.
 * Writes SLASH_APPEAL_FILED to Obsidian. Freezes stake as LOCKED_APPEAL.
 *
 * GET /api/appeals — List the caller's appeal records
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, assertString, rateLimit, clientIp } from '@/lib/auth-guard'
import {
  validateAppeal,
  buildAppealFiledEvent,
  hashEvidence,
} from '@gp4u/mnemo-engine'

// ─── POST: File an appeal ──────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  // Rate limit: 3 appeals per 24 hours (appeals are serious, not spammable)
  const rl = rateLimit(clientIp(req), 3, 86400)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Appeal rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  try {
    assertString(b.slash_event_id, 'slash_event_id', 36)
    assertString(b.statement,      'statement',      5000)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Validation error' }, { status: 400 })
  }

  const slash_event_id = String(b.slash_event_id).trim()
  const statement      = String(b.statement).trim()
  const evidence_urls  = Array.isArray(b.evidence_urls)
    ? (b.evidence_urls as unknown[]).filter(u => typeof u === 'string').slice(0, 10) as string[]
    : []

  // Load the slash event
  const slash = await prisma.slashEvent.findUnique({
    where:   { id: slash_event_id },
    include: {
      node:   { select: { owner_user_id: true, node_id: true } },
      appeal: { select: { appeal_id: true } },
      stake:  { select: { id: true, current_amount: true } },
    },
  })

  if (!slash) {
    return NextResponse.json({ error: 'Slash event not found' }, { status: 404 })
  }

  // Only the node owner can appeal
  if (slash.node.owner_user_id !== auth.user.id) {
    return NextResponse.json({ error: 'Not authorized to appeal this slash' }, { status: 403 })
  }

  // Check for existing appeal
  if (slash.appeal) {
    return NextResponse.json({
      error:     'An appeal has already been filed for this slash event',
      appeal_id: slash.appeal.appeal_id,
    }, { status: 409 })
  }

  // Validate the appeal (deadline, statement length, URL format)
  const validation = validateAppeal({
    slash_event_id:  slash.id,
    slash_id:        slash.slash_id,
    filed_by:        auth.user.id,
    statement,
    evidence_urls,
    appeal_deadline: slash.appeal_deadline,
  })

  if (!validation.valid) {
    return NextResponse.json({ error: validation.reason }, { status: 400 })
  }

  const ledger_event = buildAppealFiledEvent({
    slash_event_id:  slash.id,
    slash_id:        slash.slash_id,
    filed_by:        auth.user.id,
    statement,
    evidence_urls,
    appeal_deadline: slash.appeal_deadline,
  })

  // Write to Obsidian first
  const last_block = await prisma.ledgerEntry.findFirst({
    orderBy: { block_index: 'desc' },
    select:  { block_index: true, block_hash: true, sequence: true },
  })

  const block_index  = (last_block?.block_index ?? 0) + 1
  const sequence     = (last_block?.sequence ?? 0) + 1
  const prev_hash    = last_block?.block_hash ?? '0'.repeat(64)
  const payload_hash = hashEvidence(ledger_event)

  const { createHash } = await import('crypto')
  const block_hash = createHash('sha256')
    .update(prev_hash)
    .update(payload_hash)
    .update(String(block_index))
    .digest('hex')

  await prisma.ledgerEntry.create({
    data: {
      entry_id:    crypto.randomUUID(),
      block_index,
      sequence,
      event_type:  ledger_event.event_type,
      severity:    'INFO',
      subject_id:  auth.user.id,
      target_type: 'PROVIDER_NODE',
      metadata:    ledger_event.metadata as object,
      timestamp:   new Date(),
      prev_hash,
      payload_hash,
      block_hash,
    },
  })

  // Create the appeal record and lock the stake
  const [appeal] = await prisma.$transaction([
    prisma.appealRecord.create({
      data: {
        slash_event_id: slash.id,
        filed_by:       auth.user.id,
        statement,
        evidence_urls:  JSON.stringify(evidence_urls),
        status:         'PENDING',
      },
    }),
    // Freeze stake while appeal is under review
    ...(slash.stake
      ? [prisma.providerStake.update({
          where: { id: slash.stake.id },
          data:  { status: 'LOCKED_APPEAL' },
        })]
      : []),
    // Mark slash as appealed
    prisma.slashEvent.update({
      where: { id: slash.id },
      data:  { appealed: true },
    }),
  ])

  return NextResponse.json({
    appeal_id:      appeal.appeal_id,
    slash_event_id: slash.id,
    status:         'PENDING',
    ledger_block:   block_index,
    message:        'Appeal filed. Your stake is frozen pending review. You will be notified of the outcome.',
  }, { status: 201 })
}

// ─── GET: List caller's appeals ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const appeals = await prisma.appealRecord.findMany({
    where:   { filed_by: auth.user.id },
    orderBy: { filed_at: 'desc' },
    take:    50,
    include: {
      slash_event: {
        select: {
          slash_id:  true,
          condition: true,
          severity:  true,
          slash_amount: true,
          created_at:   true,
        },
      },
    },
  })

  return NextResponse.json({ appeals })
}
