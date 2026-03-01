/**
 * PATCH /api/appeals/[appealId] — Resolve an Appeal (Admin)
 *
 * Admin accepts or rejects an appeal.
 * On ACCEPT: stake restored, node un-suspended if this was sole suspension trigger.
 * On REJECT: stake stays slashed, node status unchanged.
 *
 * Both outcomes are immutably written to Obsidian. The original slash entry
 * is NEVER modified — only the appeal resolution entry is added.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, assertString, CLEARANCE } from '@/lib/auth-guard'
import { resolveAppeal, hashEvidence } from '@gp4u/mnemo-engine'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { appealId: string } },
) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  const { appealId } = params

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  if (typeof b.accepted !== 'boolean') {
    return NextResponse.json({ error: '"accepted" must be a boolean' }, { status: 400 })
  }

  try {
    assertString(b.resolution_note, 'resolution_note', 2000)
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Validation error' }, { status: 400 })
  }

  const appeal = await prisma.appealRecord.findUnique({
    where:   { appeal_id: appealId },
    include: {
      slash_event: {
        include: {
          node:  { select: { node_id: true, status: true } },
          stake: { select: { id: true, current_amount: true } },
        },
      },
    },
  })

  if (!appeal) {
    return NextResponse.json({ error: 'Appeal not found' }, { status: 404 })
  }

  if (appeal.status !== 'PENDING' && appeal.status !== 'UNDER_REVIEW') {
    return NextResponse.json({
      error: `Appeal is already resolved (status: ${appeal.status})`,
    }, { status: 409 })
  }

  const resolution = resolveAppeal({
    appeal_id:       appeal.appeal_id,
    slash_event_id:  appeal.slash_event_id,
    node_id:         appeal.slash_event.node.node_id,
    reviewed_by:     auth.user.id,
    accepted:        b.accepted,
    resolution_note: String(b.resolution_note),
    amount_slashed:  Number(appeal.slash_event.slash_amount),
  })

  // Write resolution to Obsidian
  const last_block = await prisma.ledgerEntry.findFirst({
    orderBy: { block_index: 'desc' },
    select:  { block_index: true, block_hash: true, sequence: true },
  })

  const block_index  = (last_block?.block_index ?? 0) + 1
  const sequence     = (last_block?.sequence ?? 0) + 1
  const prev_hash    = last_block?.block_hash ?? '0'.repeat(64)
  const payload_hash = hashEvidence(resolution.ledger_event)

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
      event_type:  resolution.ledger_event.event_type,
      severity:    resolution.ledger_event.severity === 'INFO' ? 'INFO' : 'WARNING',
      subject_id:  appeal.slash_event.node.node_id,
      target_type: 'PROVIDER_NODE',
      metadata:    resolution.ledger_event.metadata as object,
      timestamp:   new Date(),
      prev_hash,
      payload_hash,
      block_hash,
    },
  })

  const new_status = b.accepted ? 'ACCEPTED' : 'REJECTED'
  const stake      = appeal.slash_event.stake

  await prisma.$transaction([
    // Update appeal record
    prisma.appealRecord.update({
      where: { appeal_id: appealId },
      data: {
        status:          new_status,
        reviewed_by:     auth.user.id,
        resolution_note: String(b.resolution_note),
        amount_restored: resolution.amount_restored,
        resolved_at:     new Date(),
      },
    }),
    // Restore stake if accepted
    ...(b.accepted && stake && resolution.amount_restored > 0
      ? [prisma.providerStake.update({
          where: { id: stake.id },
          data: {
            current_amount: { increment: resolution.amount_restored },
            total_slashed:  { decrement: resolution.amount_restored },
            status: 'ACTIVE',
          },
        })]
      : stake
        ? [prisma.providerStake.update({
            where: { id: stake.id },
            data:  { status: 'PARTIALLY_SLASHED' },  // unlock from LOCKED_APPEAL
          })]
        : []),
    // Un-suspend node if appeal accepted and node was suspended (not ejected)
    ...(b.accepted && appeal.slash_event.node.status === 'SUSPENDED'
      ? [prisma.providerNode.update({
          where: { node_id: appeal.slash_event.node.node_id },
          data:  { status: 'ACTIVE', suspended_reason: null },
        })]
      : []),
  ])

  return NextResponse.json({
    appeal_id:       appealId,
    status:          new_status,
    amount_restored: resolution.amount_restored,
    ledger_block:    block_index,
    message:         b.accepted
      ? `Appeal accepted. $${resolution.amount_restored} restored to provider stake.`
      : 'Appeal rejected. Original slash upheld.',
  })
}
