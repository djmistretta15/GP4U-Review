/**
 * Next.js Middleware — Custodes Gate
 *
 * Every /api/* request passes through Dextera (identity) and Aedituus (policy)
 * before reaching the route handler. Injects correlation_id, subject_id,
 * clearance_level, and trust_score as headers so route handlers can read
 * them without re-verifying.
 *
 * Upgrade path:
 *   Current: stub validation (accepts any Bearer token, stub subject in dev)
 *   Next:    swap stub verify() for DexteraPassportService.verify()
 *            once RS256 keys are provisioned and the auth flow is built
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

const OPEN_ROUTES = new Set([
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/telemetry/russian-doll',  // Provider agents use their own job-scoped token
])

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const correlation_id = uuidv4()

  // Always inject correlation ID — even on open routes
  const response = NextResponse.next()
  response.headers.set('x-correlation-id', correlation_id)

  // Open routes pass straight through
  if (OPEN_ROUTES.has(pathname)) return response

  // ── Stub auth in dev ─────────────────────────────────────────────────────
  // In production: verify Bearer token with DexteraPassportService,
  // check Aedituus policy, return 401/403 on failure.
  const auth = request.headers.get('Authorization')
  if (!auth && process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Missing Authorization header' },
      { status: 401, headers: { 'x-correlation-id': correlation_id } }
    )
  }

  // Inject stub subject for dev — real passport values in production
  response.headers.set('x-subject-id', 'demo-subject-id')
  response.headers.set('x-clearance-level', '0')
  response.headers.set('x-trust-score', '80')

  return response
}

export const config = {
  matcher: '/api/:path*',
}
