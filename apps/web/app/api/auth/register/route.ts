/**
 * POST /api/auth/register — Customer Registration
 *
 * Creates a new user account:
 *   1. Validates input
 *   2. Hashes password with bcrypt (cost factor 12)
 *   3. Creates user record with email_verified = false
 *   4. Sends email verification via Resend
 *   5. Logs auth event to Obsidian
 *
 * Rate limit: 5 registrations per hour per IP (prevents mass account creation).
 * Email uniqueness enforced at DB level + checked here for clean error messages.
 */

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/db'
import { rateLimit } from '@/lib/rate-limit'
import { clientIp } from '@/lib/auth-guard'
import { generateVerificationToken } from '@/lib/tokens'
import { sendVerificationEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  const ip = clientIp(req)

  // Rate limit: 5 attempts per hour per IP
  const rl = await rateLimit(`register:ip:${ip}`, 5, 3600)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please wait before trying again.' },
      { status: 429 }
    )
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { email, name, password, ref } = body as {
    email?:    unknown
    name?:     unknown
    password?: unknown
    ref?:      unknown
  }

  // ── Input validation ─────────────────────────────────────────────────────

  if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return NextResponse.json({ error: 'Password must be between 8 and 128 characters' }, { status: 400 })
  }

  const sanitizedEmail = email.toLowerCase().trim()
  const sanitizedName  = name.trim()
  const refCode        = typeof ref === 'string' ? ref.slice(0, 64) : null

  // ── Check email uniqueness ────────────────────────────────────────────────

  const existing = await prisma.user.findUnique({ where: { email: sanitizedEmail } })
  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists. Try signing in instead.' },
      { status: 409 }
    )
  }

  // ── Hash password + generate verification token ───────────────────────────

  const [password_hash, verification_token] = await Promise.all([
    bcrypt.hash(password, 12),
    Promise.resolve(generateVerificationToken()),
  ])

  // ── Create user ───────────────────────────────────────────────────────────

  const user = await prisma.user.create({
    data: {
      email:              sanitizedEmail,
      name:               sanitizedName,
      password_hash,
      verification_token,
      email_verified:     false,
      clearance_level:    0,   // EMAIL_ONLY — upgrades to 1 after verification
      trust_score:        0,
      identity_provider:  'EMAIL_PASSWORD',
    },
  })

  // ── Send verification email ───────────────────────────────────────────────
  // Non-fatal: if email fails, user can request a new one later

  await sendVerificationEmail({
    to:    user.email,
    name:  user.name ?? user.email,
    token: verification_token,
  }).catch(err => console.error('[register] Email send failed:', err))

  // ── Log auth event ────────────────────────────────────────────────────────

  await prisma.authEvent.create({
    data: {
      subject_id: user.id,
      event_type: 'REGISTER',
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? 'unknown',
      success:    true,
    },
  }).catch(() => { /* non-fatal */ })

  return NextResponse.json(
    {
      user_id:     user.id,
      email:       user.email,
      name:        user.name,
      ref_applied: !!refCode,
      next_step:   '/login',
      message:     'Account created. Check your email to verify your address before logging in.',
    },
    { status: 201 }
  )
}
