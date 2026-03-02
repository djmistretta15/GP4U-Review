/**
 * POST /api/auth/logout — Terminate session
 *
 * Clears the gp4u_refresh HttpOnly cookie and nulls the refresh token in DB,
 * invalidating all existing sessions for this user.
 *
 * The client is responsible for clearing its in-memory access token.
 * The access token itself expires after 15 minutes even without logout —
 * it is short-lived by design.
 *
 * This route is open (no Bearer required) so users can log out
 * even if their access token has already expired.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  const refresh_token = req.cookies.get('gp4u_refresh')?.value

  if (refresh_token) {
    // Revoke the refresh token in DB (best-effort — don't fail the response)
    await prisma.user.updateMany({
      where: { refresh_token },
      data:  { refresh_token: null },
    }).catch(() => {})
  }

  const res = NextResponse.json({ success: true })

  // Clear the refresh cookie
  res.cookies.set('gp4u_refresh', '', {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/api/auth/refresh',
    maxAge:   0,
  })

  return res
}
