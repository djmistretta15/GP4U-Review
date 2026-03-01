/**
 * GET /api/health — Detailed Platform Health Check (authenticated)
 *
 * Returns full chamber status, event bus stats, and internal topology.
 * Used by monitoring dashboards and the admin UI.
 *
 * This route REQUIRES authentication (not in OPEN_ROUTES).
 * For an unauthenticated liveness probe see GET /api/health/public.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getEventBus } from '@gp4u/event-bus'
import { getChamberRegistry } from '@gp4u/chamber-registry'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const bus = getEventBus()
    const registry = getChamberRegistry()

    const [chamber_statuses, bus_stats] = await Promise.all([
      registry.getAllStatuses(),
      Promise.resolve(bus.getStats()),
    ])

    const all_healthy = chamber_statuses.every(s => s.health !== 'OFFLINE')

    return NextResponse.json({
      status:           all_healthy ? 'ok' : 'degraded',
      timestamp:        new Date().toISOString(),
      bus:              bus_stats,
      chambers:         chamber_statuses,
      docked_count:     registry.getDockedChamberIds().length,
      active_chambers:  chamber_statuses.filter(s => s.mode === 'ACTIVE').map(s => s.chamber_id),
    }, {
      status: all_healthy ? 200 : 207,
    })
  } catch {
    return NextResponse.json({ error: 'Health check failed' }, { status: 500 })
  }
}
