/**
 * /api/admin/chambers — Chamber Registry Control
 *
 * GET  → list all chambers with full status
 * POST → control actions: dock, undock, activate, deactivate, backtest
 *
 * Body for POST:
 *   { action: 'activate' | 'deactivate' | 'undock' | 'backtest', chamber_id: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { getChamberRegistry } from '@gp4u/chamber-registry'
import { getEventBus } from '@gp4u/event-bus'

export async function GET() {
  try {
    const registry = getChamberRegistry()
    const bus      = getEventBus()

    const chambers    = await registry.getAllStatuses()
    const influences  = registry.getActiveInfluences()
    const bus_stats   = bus.getStats()

    return NextResponse.json({
      chambers,
      active_influences: influences,
      bus: bus_stats,
      docked_ids: registry.getDockedChamberIds(),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, chamber_id } = await req.json() as {
      action: string
      chamber_id: string
    }

    const registry = getChamberRegistry()

    if (action === 'activate') {
      const to   = new Date()
      const from = new Date(to.getTime() - 24 * 60 * 60 * 1000)
      const result = await registry.runBacktestAndActivate(chamber_id, from, to)
      return NextResponse.json({ ok: true, result })
    }

    if (action === 'deactivate') {
      await registry.setMode(chamber_id, 'PASSIVE')
      return NextResponse.json({ ok: true, message: `${chamber_id} → PASSIVE` })
    }

    if (action === 'undock') {
      const ok = await registry.undock(chamber_id)
      return NextResponse.json({ ok, message: ok ? `${chamber_id} undocked` : 'Not found' })
    }

    if (action === 'backtest') {
      const { from_iso, to_iso } = await req.json().catch(() => ({}))
      const to   = to_iso   ? new Date(to_iso)   : new Date()
      const from = from_iso ? new Date(from_iso)  : new Date(to.getTime() - 24 * 60 * 60 * 1000)
      const record = (registry as unknown as { docked: Map<string, { chamber: { runBacktest: (f: Date, t: Date) => Promise<unknown> } }> }).docked?.get(chamber_id)
      if (!record) return NextResponse.json({ error: 'Not docked' }, { status: 404 })
      const result = await record.chamber.runBacktest(from, to)
      return NextResponse.json({ ok: true, result })
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
