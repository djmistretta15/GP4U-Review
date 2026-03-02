/**
 * POST /api/auth/reset-password — Set new password using reset token
 *
 * Validates the token, hashes the new password, clears the reset token,
 * and invalidates all existing sessions (rotates refresh token to null).
 *
 * Rate limit: 5 attempts per hour per IP.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/auth-guard'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await rateLimit(`reset-pw:ip:${ip}`, 5, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { token, password } = body as { token?: unknown; password?: unknown }

  if (!token || typeof token !== 'string' || token.length < 32) {
    return NextResponse.json({ error: 'Invalid or missing reset token.' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be between 8 and 128 characters.' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { password_reset_token: token } })

  if (!user || !user.password_reset_expires_at) {
    return NextResponse.json({ error: 'Invalid or expired reset link.' }, { status: 400 })
  }

  if (new Date() > user.password_reset_expires_at) {
    return NextResponse.json({ error: 'Reset link has expired. Please request a new one.' }, { status: 400 })
  }

  const password_hash = await bcrypt.hash(password, 12)

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_hash,
      password_reset_token:      null,
      password_reset_expires_at: null,
      refresh_token:             null,  // invalidate all existing sessions
    },
  })

  await prisma.authEvent.create({
    data: {
      subject_id: user.id,
      event_type: 'PASSWORD_RESET',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? 'unknown',
      success:    true,
    },
  }).catch(() => {})

  return NextResponse.json({ message: 'Password updated. You can now sign in.' })
}
