/**
 * POST /api/admin/slash — Issue a Slash Event
 *
 * Admin-only. Creates a slash event against a provider node.
 * Automatically escalates condition if thresholds are met:
 *   - 3+ warnings in 30 days → REPEATED_WARNING (soft slash)
 *   - 3+ soft slashes → REPEATED_SOFT_SLASH (hard slash + eject)
 *
 * Every slash is written to the Obsidian ledger BEFORE the stake is
 * deducted. The audit trail is unconditional.
 *
 * GET /api/admin/slash — List slash events (with filters)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, assertString, CLEARANCE } from '@/lib/auth-guard'
import {
  buildSlashResult,
  hashEvidence,
  shouldEscalateToRepeatedWarning,
  shouldEscalateToRepeatedSoftSlash,
} from '@gp4u/mnemo-engine'
import type { SlashCondition } from '@gp4u/mnemo-engine'

const VALID_CONDITIONS = new Set<SlashCondition>([
  'THERMAL_THROTTLE_EVENT', 'UPTIME_DROP_MINOR', 'TELEMETRY_DELAY',
  'VRAM_OVERCLAIM', 'JOB_DROPPED_UNEXPECTEDLY', 'UPTIME_SLA_BREACH',
  'HARDWARE_MISREPRESENTATION', 'REPEATED_WARNING',
  'TELEMETRY_TAMPERING', 'VISIBILITY_BLOCKED', 'UNAUTHORIZED_PROCESS',
  'CRYPTO_MINING_DURING_ML_JOB', 'REPEATED_SOFT_SLASH',
])

// ─── POST: Issue a slash ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  try {
    assertString(b.node_id,          'node_id',          36)
    assertString(b.condition,        'condition',        64)
    assertString(b.evidence_summary, 'evidence_summary', 2000)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Validation error'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const node_id          = String(b.node_id).trim()
  const condition        = String(b.condition).trim() as SlashCondition
  const evidence_summary = String(b.evidence_summary).trim()
  const evidence_payload = (b.evidence_payload ?? {}) as object

  if (!VALID_CONDITIONS.has(condition)) {
    return NextResponse.json({ error: `Unknown slash condition: ${condition}` }, { status: 400 })
  }

  // Load node + active stake
  const node = await prisma.providerNode.findUnique({
    where: { node_id },
    include: {
      stakes: { where: { status: { in: ['ACTIVE', 'PARTIALLY_SLASHED'] } }, take: 1 },
    },
  })

  if (!node) {
    return NextResponse.json({ error: 'Provider node not found' }, { status: 404 })
  }

  const stake = node.stakes[0] ?? null

  // Auto-escalation: check if this warning should become REPEATED_WARNING
  let final_condition = condition
  if (condition === 'THERMAL_THROTTLE_EVENT' || condition === 'UPTIME_DROP_MINOR' || condition === 'TELEMETRY_DELAY') {
    const thirty_days_ago = new Date()
    thirty_days_ago.setDate(thirty_days_ago.getDate() - 30)

    const recent_warnings = await prisma.slashEvent.count({
      where: {
        node_id,
        severity:   'WARNING',
        created_at: { gte: thirty_days_ago },
      },
    })

    if (shouldEscalateToRepeatedWarning(recent_warnings + 1)) {
      final_condition = 'REPEATED_WARNING'
    }
  }

  // Auto-escalation: check if this soft slash should become REPEATED_SOFT_SLASH
  if (final_condition !== 'REPEATED_WARNING') {
    const soft_slash_count = await prisma.slashEvent.count({
      where: { node_id, severity: 'SOFT_SLASH' },
    })
    if (
      shouldEscalateToRepeatedSoftSlash(soft_slash_count + 1) &&
      !['TELEMETRY_TAMPERING', 'VISIBILITY_BLOCKED', 'UNAUTHORIZED_PROCESS',
        'CRYPTO_MINING_DURING_ML_JOB', 'REPEATED_SOFT_SLASH'].includes(final_condition)
    ) {
      final_condition = 'REPEATED_SOFT_SLASH'
    }
  }

  const current_stake = stake ? Number(stake.current_amount) : 0

  const result = buildSlashResult({
    node_id,
    stake_id:         stake?.id ?? '',
    current_stake,
    condition:        final_condition,
    evidence_payload,
    evidence_summary,
    issued_by:        auth.user.id,
  })

  // Write to Obsidian ledger first — unconditional audit trail
  const last_block = await prisma.ledgerEntry.findFirst({
    orderBy: { block_index: 'desc' },
    select:  { block_index: true, block_hash: true, sequence: true },
  })

  const block_index = (last_block?.block_index ?? 0) + 1
  const sequence    = (last_block?.sequence ?? 0) + 1
  const prev_hash   = last_block?.block_hash ?? '0'.repeat(64)
  const payload_hash = hashEvidence(result.ledger_event)

  const { createHash } = await import('crypto')
  const block_hash = createHash('sha256')
    .update(prev_hash)
    .update(payload_hash)
    .update(String(block_index))
    .digest('hex')

  const ledger_entry = await prisma.ledgerEntry.create({
    data: {
      entry_id:     result.slash_id,
      block_index,
      sequence,
      event_type:   result.ledger_event.event_type,
      severity:     result.ledger_event.severity,
      subject_id:   node_id,
      target_type:  result.ledger_event.target_type,
      metadata:     result.ledger_event.metadata as object,
      timestamp:    new Date(),
      prev_hash,
      payload_hash,
      block_hash,
    },
  })

  // Now persist the slash event + update stake (in a transaction)
  const [slash_event] = await prisma.$transaction([
    prisma.slashEvent.create({
      data: {
        slash_id:        result.slash_id,
        node_id,
        stake_id:        stake?.id ?? null,
        condition:       final_condition as never,
        severity:        result.severity as never,
        description:     result.ledger_event.metadata.description ?? evidence_summary,
        evidence_hash:   result.evidence_hash,
        evidence_summary,
        ledger_entry_id: String(ledger_entry.block_index),
        slash_amount:    result.amount_slashed,
        pct_of_stake:    result.pct_slashed,
        appeal_deadline: result.appeal_deadline,
        issued_by:       auth.user.id,
      },
    }),
    // Update stake if there's a financial deduction
    ...(stake && result.amount_slashed > 0
      ? [prisma.providerStake.update({
          where: { id: stake.id },
          data: {
            current_amount: { decrement: result.amount_slashed },
            total_slashed:  { increment: result.amount_slashed },
            status: result.new_stake <= 0 ? 'FULLY_SLASHED' : 'PARTIALLY_SLASHED',
          },
        })]
      : []),
    // Eject node if required
    ...(result.eject
      ? [prisma.providerNode.update({
          where: { node_id },
          data:  { status: 'EJECTED', suspended_reason: `Ejected: ${final_condition}` },
        })]
      : []),
  ])

  return NextResponse.json({
    slash_id:        result.slash_id,
    condition:       final_condition,
    severity:        result.severity,
    amount_slashed:  result.amount_slashed,
    new_stake:       result.new_stake,
    eject:           result.eject,
    evidence_hash:   result.evidence_hash,
    appeal_deadline: result.appeal_deadline,
    ledger_block:    block_index,
    escalated_from:  final_condition !== condition ? condition : undefined,
  }, { status: 201 })
}

// ─── GET: List slash events ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const node_id   = searchParams.get('node_id') ?? undefined
  const severity  = searchParams.get('severity') ?? undefined
  const condition = searchParams.get('condition') ?? undefined
  const limit     = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)))
  const page      = Math.max(1, Number(searchParams.get('page') ?? 1))

  const where: Record<string, unknown> = {}
  if (node_id)   where.node_id   = node_id
  if (severity && ['WARNING', 'SOFT_SLASH', 'HARD_SLASH'].includes(severity))
    where.severity = severity
  if (condition && VALID_CONDITIONS.has(condition as SlashCondition))
    where.condition = condition

  const [events, total] = await Promise.all([
    prisma.slashEvent.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take:    limit,
      skip:    (page - 1) * limit,
      include: { appeal: { select: { appeal_id: true, status: true } } },
    }),
    prisma.slashEvent.count({ where }),
  ])

  return NextResponse.json({ events, total, page, limit })
}
