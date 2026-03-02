/**
 * POST /api/auth/forgot-password — Send password reset email
 *
 * Security properties:
 *   - Same response for existing and non-existing emails (no user enumeration)
 *   - Token is a 256-bit random value, expires in 1 hour
 *   - Old token is replaced on every request (prevents token accumulation)
 *   - Rate limit: 3 requests per hour per IP
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/auth-guard'
import { generateVerificationToken } from '@/lib/tokens'
import { sendPasswordResetEmail } from '@/lib/email'

const OK_RESPONSE = NextResponse.json({
  message: 'If an account with that email exists, a reset link has been sent.',
})

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await rateLimit(`forgot-pw:ip:${ip}`, 3, 3600)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many attempts. Please wait an hour.' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email } = body as { email?: unknown }
  if (!email || typeof email !== 'string') return OK_RESPONSE

  const sanitized = email.toLowerCase().trim()
  const user = await prisma.user.findUnique({ where: { email: sanitized } })

  if (!user || !user.password_hash) return OK_RESPONSE  // not email/password user

  const token   = generateVerificationToken()
  const expires = new Date(Date.now() + 60 * 60 * 1000)  // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password_reset_token:      token,
      password_reset_expires_at: expires,
    },
  })

  await sendPasswordResetEmail({
    to:    user.email,
    name:  user.name ?? user.email,
    token,
  }).catch(err => console.error('[forgot-password] Email failed:', err))

  return OK_RESPONSE
}
