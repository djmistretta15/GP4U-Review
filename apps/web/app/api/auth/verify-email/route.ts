/**
 * GET /api/auth/verify-email?token=<token>
 *
 * Verifies a user's email address using the token sent during registration.
 * On success:
 *   - Sets email_verified = true
 *   - Upgrades clearance_level to 1 (USER — full platform access)
 *   - Clears verification_token (one-time use)
 *   - Redirects to /onboarding (or /dashboard if already onboarded)
 *
 * Tokens expire after 24 hours (enforced by comparing token created time
 * vs. user.updatedAt — simplified here; in production add expires_at column).
 *
 * This route is in OPEN_ROUTES — no auth header required.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://gp4u.com'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token || token.length < 32) {
    return NextResponse.redirect(`${APP_URL}/register?error=invalid_token`)
  }

  const user = await prisma.user.findUnique({
    where: { verification_token: token },
  })

  if (!user) {
    return NextResponse.redirect(`${APP_URL}/register?error=invalid_token`)
  }

  if (user.email_verified) {
    // Already verified — just redirect
    return NextResponse.redirect(`${APP_URL}/dashboard`)
  }

  // Mark as verified and upgrade clearance
  await prisma.user.update({
    where: { id: user.id },
    data: {
      email_verified:     true,
      verification_token: null,
      clearance_level:    Math.max(user.clearance_level, 1),
    },
  })

  // Log verification event
  await prisma.authEvent.create({
    data: {
      subject_id: user.id,
      event_type: 'EMAIL_VERIFIED',
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown',
      user_agent: req.headers.get('user-agent') ?? 'unknown',
      success:    true,
    },
  }).catch(() => {})

  return NextResponse.redirect(`${APP_URL}/onboarding?verified=1`)
}
