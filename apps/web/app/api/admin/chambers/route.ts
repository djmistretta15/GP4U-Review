/**
 * /api/admin/chambers — Chamber Registry Control
 *
 * Security fixes:
 *   - requireAuth() with min_clearance: 3 — middleware already blocks lower
 *     clearance, but we double-check here (defence in depth)
 *   - Action allowlist — only known action strings accepted
 *   - Backtest dates validated: from < to, max 30-day window, no future dates
 *   - chamber_id validated against allowlist of known chamber names
 *   - Error messages don't leak internal stack traces
 */

import { NextRequest, NextResponse } from 'next/server'
import { getChamberRegistry } from '@gp4u/chamber-registry'
import { getEventBus } from '@gp4u/event-bus'
import { requireAuth, CLEARANCE } from '@/lib/auth-guard'

const KNOWN_CHAMBERS = new Set(['mnemo', 'aetherion', 'energy', 'veritas', 'outerim', 'mist'])
const VALID_ACTIONS   = new Set(['activate', 'deactivate', 'undock', 'backtest'])

const MAX_BACKTEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

function validateChamberId(id: unknown): id is string {
  return typeof id === 'string' && KNOWN_CHAMBERS.has(id)
}

function validateDates(from_iso: unknown, to_iso: unknown): { from: Date; to: Date } | null {
  const to   = to_iso   ? new Date(String(to_iso))   : new Date()
  const from = from_iso ? new Date(String(from_iso))  : new Date(to.getTime() - 24 * 60 * 60 * 1000)

  if (isNaN(from.getTime()) || isNaN(to.getTime())) return null
  if (from >= to)                                    return null
  if (to > new Date())                               return null  // No future dates
  if (to.getTime() - from.getTime() > MAX_BACKTEST_WINDOW_MS) return null

  return { from, to }
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  try {
    const registry = getChamberRegistry()
    const bus      = getEventBus()
    const chambers = await registry.getAllStatuses()
    const bus_stats = bus.getStats()

    return NextResponse.json({
      chambers,
      active_influences: registry.getActiveInfluences(),
      bus:               bus_stats,
      docked_ids:        registry.getDockedChamberIds(),
    })
  } catch (err) {
    console.error('[admin/chambers] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch chamber status' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req, { min_clearance: CLEARANCE.ADMIN })
  if (!auth.ok) return auth.response

  try {
    const body = await req.json() as Record<string, unknown>
    const { action, chamber_id } = body

    if (!VALID_ACTIONS.has(String(action))) {
      return NextResponse.json({ error: `Unknown action. Must be: ${[...VALID_ACTIONS].join(', ')}` }, { status: 400 })
    }
    if (!validateChamberId(chamber_id)) {
      return NextResponse.json({ error: `Unknown chamber_id. Must be one of: ${[...KNOWN_CHAMBERS].join(', ')}` }, { status: 400 })
    }

    const registry = getChamberRegistry()

    if (action === 'activate') {
      const dates = validateDates(body.from_iso, body.to_iso)
      const { from, to } = dates ?? {
        to: new Date(),
        from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      }
      const result = await registry.runBacktestAndActivate(chamber_id, from, to)
      return NextResponse.json({ ok: true, result })
    }

    if (action === 'deactivate') {
      await registry.setMode(chamber_id, 'PASSIVE')
      return NextResponse.json({ ok: true, message: `${chamber_id} → PASSIVE` })
    }

    if (action === 'undock') {
      const ok = await registry.undock(chamber_id)
      return NextResponse.json({ ok })
    }

    if (action === 'backtest') {
      const dates = validateDates(body.from_iso, body.to_iso)
      if (!dates) {
        return NextResponse.json({
          error: 'Invalid date range. from must be before to, to must be in the past, max 30 days',
        }, { status: 400 })
      }
      const statuses = await registry.getAllStatuses()
      const chamber  = statuses.find(s => s.chamber_id === chamber_id)
      if (!chamber) return NextResponse.json({ error: 'Chamber not docked' }, { status: 404 })

      // Run backtest via the public registry API (no private field access)
      const result = await registry.runBacktestAndActivate(chamber_id, dates.from, dates.to)
      return NextResponse.json({ ok: true, result })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[admin/chambers] POST error:', err)
    // Don't leak internal error details
    return NextResponse.json({ error: 'Action failed' }, { status: 500 })
  }
}
