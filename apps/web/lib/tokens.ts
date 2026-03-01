/**
 * Token issuance — mirrors verifyToken() in middleware.ts
 *
 * Token format (Phase 1 — HMAC-SHA256):
 *   base64url(JSON payload) + "." + base64url(HMAC-SHA256 signature)
 *   payload: { sub: UUID, clr: number, trs: number, exp: unix_ms }
 *
 * Access tokens:  15 minutes
 * Refresh tokens: 30 days (opaque random string, stored in DB)
 */

import crypto from 'crypto'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenPayload {
  sub: string   // user UUID
  clr: number   // clearance level
  trs: number   // trust score
  exp: number   // expiry unix ms
}

// ─── Durations ────────────────────────────────────────────────────────────────

const ACCESS_TTL_MS  = 15 * 60 * 1000        // 15 minutes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000  // 30 days

// ─── Helpers ──────────────────────────────────────────────────────────────────

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

// ─── Access token ─────────────────────────────────────────────────────────────

/**
 * Issue a short-lived HMAC-SHA256 access token for a user.
 * Returns the token string to be sent as Authorization: Bearer <token>.
 */
export function issueAccessToken(
  userId:         string,
  clearanceLevel: number,
  trustScore:     number,
): string {
  const secret = process.env.GP4U_TOKEN_SECRET
  if (!secret) throw new Error('GP4U_TOKEN_SECRET not set')

  const payload: TokenPayload = {
    sub: userId,
    clr: clearanceLevel,
    trs: trustScore,
    exp: Date.now() + ACCESS_TTL_MS,
  }

  const payload_b64 = base64UrlEncode(JSON.stringify(payload))
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload_b64)
    .digest()
  const sig_b64 = base64UrlEncode(sig)

  return `${payload_b64}.${sig_b64}`
}

// ─── Refresh token ────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random refresh token (opaque string).
 * Store this in the DB; never decode it server-side.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex')  // 96 chars, 384-bit entropy
}

/**
 * How long (in seconds) until a new refresh token expires.
 * Used to set the cookie Max-Age.
 */
export const REFRESH_TTL_S = REFRESH_TTL_MS / 1000

/**
 * Generate a cryptographically random email verification token (URL-safe).
 */
export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString('hex')  // 64 chars, 256-bit entropy
}
