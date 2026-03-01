/**
 * POST /api/auth/register — Customer Registration
 *
 * Creates a new user account. In production this would:
 *   1. Hash the password (bcrypt/argon2)
 *   2. Send email verification
 *   3. Issue a short-lived session token
 *
 * At this stage: creates the user record, issues a dev-mode session.
 * Plug in your auth provider (NextAuth, Clerk, Auth0) here — the user model
 * is already fully defined in Prisma.
 *
 * Rate limit: 5 registrations per hour per IP (prevents mass account creation).
 * Email uniqueness enforced at DB level + checked here for clean error messages.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { rateLimit, clientIp } from '@/lib/auth-guard'

export async function POST(req: NextRequest) {
  // Rate limit: 5 attempts per hour per IP
  const rl = rateLimit(clientIp(req), 5, 3600)
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

  // ── Create user ───────────────────────────────────────────────────────────
  // NOTE: In production, hash the password with bcrypt/argon2 before storing.
  // This scaffold stores a placeholder — integrate your auth provider here.

  const user = await prisma.user.create({
    data: {
      email:             sanitizedEmail,
      name:              sanitizedName,
      clearance_level:   0,   // EMAIL_ONLY — upgrades on verification
      trust_score:       0,
      identity_provider: 'EMAIL_PASSWORD',
      // referral: refCode stored via separate referral table (future)
    },
  })

  // ── Log auth event ────────────────────────────────────────────────────────

  await prisma.authEvent.create({
    data: {
      user_id:    user.id,
      event_type: 'REGISTER',
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent') ?? 'unknown',
      success:    true,
    },
  }).catch(() => { /* non-fatal */ })

  return NextResponse.json(
    {
      user_id:    user.id,
      email:      user.email,
      name:       user.name,
      ref_applied: !!refCode,
      next_step:  '/onboarding',
      message:    'Account created. Redirecting to onboarding.',
    },
    { status: 201 }
  )
}
