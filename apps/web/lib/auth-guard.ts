/**
 * Auth Guard — server-side authentication enforcement
 *
 * Every protected route calls requireAuth() at the top of the handler.
 * This is the single source of truth for authentication on the server.
 *
 * In production:  x-subject-id is injected ONLY by Dextera after RS256 JWT
 *                 verification in middleware. Routes trust this header because
 *                 Next.js middleware runs before handlers and the header is
 *                 set server-side — it cannot be spoofed from the client.
 *
 * In development: GP4U_DEV_SUBJECT_ID env var provides a fixed subject ID.
 *                 This MUST be a real user ID in the database (not a magic string).
 *                 The demo fallback is REMOVED — routes fail closed, not open.
 *
 * Never falls back to demo@gp4u.com or any hardcoded user.
 * Never accepts x-subject-id: 'demo-subject-id' as valid.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import type { User } from '@prisma/client'

// ─── Constants ────────────────────────────────────────────────────────────────

// Clearance levels (must match the enum in Prisma schema)
export const CLEARANCE = {
  PUBLIC: 0,
  USER:   1,
  ADMIN:  3,
  SUPER:  5,
} as const

// ─── Auth result types ────────────────────────────────────────────────────────

export type AuthOk   = { ok: true;  user: User; subject_id: string; clearance: number }
export type AuthFail = { ok: false; response: NextResponse }

// ─── Core guard ───────────────────────────────────────────────────────────────

/**
 * Require authentication. Returns the authenticated user or a 401/403 response.
 *
 * Usage:
 *   const auth = await requireAuth(req)
 *   if (!auth.ok) return auth.response
 *   const { user } = auth
 */
export async function requireAuth(
  req: NextRequest,
  options?: { min_clearance?: number }
): Promise<AuthOk | AuthFail> {
  const subject_id  = resolveSubjectId(req)
  const clearance   = parseInt(req.headers.get('x-clearance-level') ?? '0', 10)

  if (!subject_id) {
    return {
      ok:       false,
      response: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  // Clearance level check (for admin routes)
  if (options?.min_clearance !== undefined && clearance < options.min_clearance) {
    return {
      ok:       false,
      response: NextResponse.json(
        { error: 'Insufficient clearance level' },
        { status: 403 }
      ),
    }
  }

  // Look up the real user — never trust the ID without database verification
  const user = await prisma.user.findUnique({ where: { id: subject_id } })
  if (!user) {
    return {
      ok:       false,
      response: NextResponse.json(
        { error: 'User not found' },
        { status: 401 }
      ),
    }
  }

  return { ok: true, user, subject_id, clearance }
}

/**
 * Resolve the subject ID from the request.
 *
 * In production: read from x-subject-id (injected by middleware after
 *                Dextera JWT verification — cannot be client-spoofed).
 *
 * In dev:        GP4U_DEV_SUBJECT_ID env var (must be set to a real UUID).
 *                Falls back to x-subject-id if that env is absent.
 *
 * Never returns 'demo-subject-id' or any hardcoded stub value.
 */
function resolveSubjectId(req: NextRequest): string | null {
  const from_header = req.headers.get('x-subject-id')

  // In dev, allow env var override so tests and local dev can inject a real user ID
  const dev_subject = process.env.NODE_ENV !== 'production'
    ? process.env.GP4U_DEV_SUBJECT_ID ?? null
    : null

  const subject_id = from_header ?? dev_subject

  // Reject the stub placeholder — never allow demo-subject-id through
  if (!subject_id || subject_id === 'demo-subject-id') return null

  // Basic UUID format check — subject IDs must be UUIDs
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(subject_id)) return null

  return subject_id
}

// ─── Rate limiter (in-memory, per-IP, no external dependency) ─────────────────
// Production upgrade: replace with Redis sliding window via Upstash.

const _rl_map = new Map<string, { count: number; reset_at: number }>()

/**
 * Simple token-bucket rate limiter. Returns true if the request should be allowed.
 *
 * @param key      Identifier (IP address or subject_id)
 * @param limit    Max requests per window
 * @param window_s Window size in seconds
 */
export function rateLimit(key: string, limit = 60, window_s = 60): boolean {
  const now    = Date.now()
  const entry  = _rl_map.get(key)

  if (!entry || now > entry.reset_at) {
    _rl_map.set(key, { count: 1, reset_at: now + window_s * 1000 })
    return true
  }

  if (entry.count >= limit) return false
  entry.count++
  return true
}

/** Returns the client IP from the request, falling back to 'unknown'. */
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown'
  )
}

// ─── Input validators ─────────────────────────────────────────────────────────

/** Assert a number is finite, non-NaN, and within [min, max]. */
export function assertFinite(
  value: unknown,
  name: string,
  min: number,
  max: number
): asserts value is number {
  if (typeof value !== 'number' || !isFinite(value) || isNaN(value)) {
    throw new ValidationError(`${name} must be a finite number`)
  }
  if (value < min || value > max) {
    throw new ValidationError(`${name} must be between ${min} and ${max}`)
  }
}

/** Assert a string is non-empty and within max length. */
export function assertString(
  value: unknown,
  name: string,
  max_len = 256
): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError(`${name} must be a non-empty string`)
  }
  if (value.length > max_len) {
    throw new ValidationError(`${name} must be at most ${max_len} characters`)
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** Wrap a route handler to return 400 on ValidationError. */
export function withValidation<T>(
  fn: () => Promise<T>
): Promise<T | NextResponse> {
  return fn().catch(err => {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 }) as T
    }
    throw err
  })
}
