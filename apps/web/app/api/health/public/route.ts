/**
 * GET /api/health/public — Minimal Public Health Check
 *
 * This route is in OPEN_ROUTES (no auth required).
 * Returns only a status string + timestamp — no chamber names, no bus stats,
 * no internal topology. Safe for load balancers, uptime monitors, and CDN probes.
 *
 * For detailed health info (chamber modes, bus stats), use GET /api/health
 * which requires a valid authenticated token.
 */

import { NextResponse } from 'next/server'
import { getChamberRegistry } from '@gp4u/chamber-registry'

export async function GET() {
  try {
    const registry = getChamberRegistry()
    const statuses  = await registry.getAllStatuses()
    const healthy   = statuses.every(s => s.health !== 'OFFLINE')

    return NextResponse.json(
      {
        status:    healthy ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
      },
      { status: healthy ? 200 : 207 }
    )
  } catch {
    return NextResponse.json(
      { status: 'error', timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
