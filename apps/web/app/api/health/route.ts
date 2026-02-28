/**
 * /api/health — Platform Health Check
 *
 * Returns status of every docked chamber + event bus stats.
 * Used by monitoring, load balancers, and the admin dashboard.
 * This route is in OPEN_ROUTES — no auth required.
 */

import { NextResponse } from 'next/server'
import { getEventBus } from '@gp4u/event-bus'
import { getChamberRegistry } from '@gp4u/chamber-registry'

export async function GET() {
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
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      error:  error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}
