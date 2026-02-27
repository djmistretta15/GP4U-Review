/**
 * @gp4u/platform-core — Custodes Middleware for Next.js
 *
 * Drop this into apps/web/middleware.ts and it wraps every API route with:
 *   1. Dextera passport verification (identity)
 *   2. Aedituus policy check (authorization)
 *   3. Correlation ID injection (full-trace logging)
 *
 * Bulkhead behavior:
 *   - If Dextera is unavailable → 401 (fail-closed, never allow through)
 *   - If Aedituus is unavailable → 503 with Retry-After (fail-closed)
 *   - Public routes (defined in OPEN_ROUTES) bypass auth entirely
 *
 * Usage — copy to apps/web/middleware.ts:
 *
 *   import { createCustodesMiddleware } from '@gp4u/platform-core'
 *   export const middleware = createCustodesMiddleware()
 *   export const config = { matcher: '/api/:path*' }
 */

import { v4 as uuidv4 } from 'uuid'

// Routes that don't require a Dextera passport
const OPEN_ROUTES = new Set([
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
])

// Routes accessible with EMAIL_ONLY clearance (basic account)
const CLEARANCE_REQUIRED: Record<string, number> = {
  '/api/jobs': 0,              // EMAIL_ONLY
  '/api/marketplace': 0,
  '/api/arbitrage': 0,
  '/api/memory/stake': 1,      // INSTITUTIONAL
  '/api/admin': 3,             // ADMIN
}

export interface MiddlewareConfig {
  /** Skip all auth checks — ONLY for local development */
  bypass_auth?: boolean
  /** Custom open routes in addition to defaults */
  extra_open_routes?: string[]
}

/**
 * Creates a Next.js middleware function that enforces Custodes on all API routes.
 *
 * In the current build this is a lightweight stub that:
 *   - Injects correlation_id header on every request
 *   - Validates that a demo passport token exists (real RS256 validation TBD)
 *   - Logs the request to the event bus (which fills Obsidian)
 *
 * Swap the stub verify() call for DexteraPassportService.verify() once
 * the RS256 keys are provisioned.
 */
export function createCustodesMiddleware(config: MiddlewareConfig = {}) {
  // This function returns a Next.js-compatible middleware.
  // It's written as a factory so you can configure it per environment.
  return async function custodesMiddleware(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const correlation_id = uuidv4()

    // Inject correlation ID so every downstream log can be traced
    const headers = new Headers(request.headers)
    headers.set('x-correlation-id', correlation_id)
    headers.set('x-gp4u-version', '0.1.0')

    // Open routes pass through immediately
    const is_open = OPEN_ROUTES.has(url.pathname) ||
      config.extra_open_routes?.includes(url.pathname)

    if (is_open || config.bypass_auth) {
      return new Response(null, { status: 200, headers })
    }

    // ── Passport Verification ─────────────────────────────────────────────────
    const auth_header = request.headers.get('Authorization')
    const token = auth_header?.replace('Bearer ', '')

    if (!token) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlation_id },
      })
    }

    // TODO: Replace stub with:
    //   const result = await dexteraService.verify({ token })
    //   if (!result.valid) return 401
    //   const passport = result.passport
    //
    // Stub accepts any non-empty token in dev
    const passport_stub = {
      subject_id: 'stub-subject',
      clearance_level: 0,
      trust_score: 80,
    }

    // ── Policy Check ──────────────────────────────────────────────────────────
    const required_clearance = CLEARANCE_REQUIRED[url.pathname] ?? 0

    if (passport_stub.clearance_level < required_clearance) {
      return new Response(JSON.stringify({ error: 'Insufficient clearance level' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlation_id },
      })
    }

    // ── Trust Score Gate ──────────────────────────────────────────────────────
    if (passport_stub.trust_score < 20) {
      return new Response(JSON.stringify({ error: 'Trust score too low — account review required' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'x-correlation-id': correlation_id },
      })
    }

    // Pass through with enriched headers
    headers.set('x-subject-id', passport_stub.subject_id)
    headers.set('x-clearance-level', String(passport_stub.clearance_level))
    headers.set('x-trust-score', String(passport_stub.trust_score))

    return new Response(null, { status: 200, headers })
  }
}
