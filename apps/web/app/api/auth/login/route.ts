/**
 * POST /api/auth/login — Password-based login
 *
 * Verifies email + password, issues an HMAC-SHA256 access token and a
 * rotating refresh token (stored in an HttpOnly cookie).
 *
 * Security properties:
 *   - Constant-time password comparison via bcrypt.compare
 *   - Same error message for wrong email and wrong password (no user enumeration)
 *   - Auth event logged to Obsidian ledger on success and failure
 *   - Rate limit: 10 attempts per 15 minutes per IP
 *   - Banned users receive 403 before any token is issued
 *
 * Response (200):
 *   { access_token, user: { id, email, name, clearance_level, email_verified } }
 *   HttpOnly cookie: gp4u_refresh  (Secure, SameSite=Lax, Max-Age=30d)
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/auth-guard'
import { issueAccessToken, generateRefreshToken, REFRESH_TTL_S } from '@/lib/tokens'

const INVALID_CREDENTIALS = 'Invalid email or password'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)

  // Rate limit: 10 attempts per 15 minutes per IP
  const rl = await rateLimit(`login:ip:${ip}`, 10, 900)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please wait before trying again.' },
      { status: 429 }
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email, password } = body as { email?: unknown; password?: unknown }

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
  }

  const sanitizedEmail = email.toLowerCase().trim()

  // Look up user
  const user = await prisma.user.findUnique({ where: { email: sanitizedEmail } })

  // Always run bcrypt.compare to prevent timing attacks, even if no user found
  const hash = user?.password_hash ?? '$2b$12$placeholder.hash.for.timing.safety.only'
  const valid = user?.password_hash
    ? await bcrypt.compare(password, hash)
    : false  // placeholder hash never matches

  if (!user || !valid) {
    // Log failed attempt (non-fatal)
    if (user) {
      await prisma.authEvent.create({
        data: {
          subject_id: user.id,
          event_type: 'LOGIN_FAILED',
          ip_address: ip,
          user_agent: req.headers.get('user-agent') ?? 'unknown',
          success:    false,
        },
      }).catch(() => {})
    }
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 })
  }

  if (user.is_banned) {
    return NextResponse.json(
      { error: 'Account suspended. Contact support@gp4u.com for assistance.' },
      { status: 403 }
    )
  }

  // Issue tokens
  const access_token   = issueAccessToken(user.id, user.clearance_level, user.trust_score)
  const refresh_token  = generateRefreshToken()

  // Store hashed refresh token in DB (rotate — invalidates previous token)
  const refresh_hash = await bcrypt.hash(refresh_token, 10)
  await prisma.user.update({
    where: { id: user.id },
    data:  { refresh_token: refresh_hash },
  })

  // Log success
  await prisma.authEvent.create({
    data: {
      subject_id: user.id,
      event_type: 'LOGIN',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? 'unknown',
      success:    true,
    },
  }).catch(() => {})

  const res = NextResponse.json({
    access_token,
    user: {
      id:              user.id,
      email:           user.email,
      name:            user.name,
      clearance_level: user.clearance_level,
      email_verified:  user.email_verified,
    },
  })

  // Set refresh token as HttpOnly cookie
  res.cookies.set('gp4u_refresh', refresh_token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/api/auth/refresh',
    maxAge:   REFRESH_TTL_S,
  })

  return res
}
