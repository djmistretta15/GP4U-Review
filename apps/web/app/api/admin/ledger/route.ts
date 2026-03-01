/**
 * /api/admin/ledger — Obsidian Ledger Explorer
 *
 * Security fixes:
 *   - requireAuth() with min_clearance: 3 (defence in depth)
 *   - limit validated: 1–100 only (prevents 0, negative, absurdly large values)
 *   - page validated: >= 1
 *   - event_type validated against known enum allowlist (prevents injection)
 *   - subject_id validated as UUID format before querying
 *   - metadata field excluded from response (may contain sensitive payload data)
 *   - Error strings not forwarded to client
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth, CLEARANCE } from '@/lib/auth-guard'

const VALID_EVENT_TYPES = new Set([
  'user.registered', 'user.authenticated', 'passport.revoked',
  'job.created', 'job.started', 'job.completed', 'job.failed',
  'gpu.listed', 'gpu.status_changed', 'gpu.health_reported',
  'arbitrage.calculated', 'memory.staked', 'memory.allocated',
  'route.calculated', 'energy.consumed', 'anomaly.detected',
  'killswitch.fired', 'data.provenance_recorded',
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = req.nextUrl

    const raw_page  = parseInt(searchParams.get('page')  ?? '1', 10)
    const raw_limit = parseInt(searchParams.get('limit') ?? '20', 10)
    const page      = isFinite(raw_page)  && raw_page  >= 1                        ? raw_page  : 1
    const limit     = isFinite(raw_limit) && raw_limit >= 1 && raw_limit <= 100    ? raw_limit : 20

    const raw_event_type = searchParams.get('event_type')
    const event_type     = raw_event_type && VALID_EVENT_TYPES.has(raw_event_type) ? raw_event_type : undefined

    const raw_subject_id = searchParams.get('subject_id')
    const subject_id     = raw_subject_id && UUID_RE.test(raw_subject_id) ? raw_subject_id : undefined

    const where = {
      ...(event_type ? { event_type } : {}),
      ...(subject_id ? { subject_id } : {}),
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { block_index: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id: true, entry_id: true, block_index: true,
          event_type: true, severity: true,
          subject_id: true, target_id: true, target_type: true,
          timestamp: true, block_hash: true, prev_hash: true, region: true,
          // metadata excluded — may contain sensitive payload data
        },
      }).catch(() => []),
      prisma.ledgerEntry.count({ where }).catch(() => 0),
    ])

    return NextResponse.json({
      entries,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    })
  } catch (err) {
    console.error('[admin/ledger] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch ledger' }, { status: 500 })
  }
}
