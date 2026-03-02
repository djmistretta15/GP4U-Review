/**
 * GET /api/auth/me — Return the currently authenticated user
 *
 * Used by AuthProvider on page load to validate a cached access token
 * and populate the auth context with the current user object.
 *
 * Returns a minimal user object (no password_hash, no tokens).
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const { user } = auth

  return NextResponse.json({
    user: {
      id:              user.id,
      email:           user.email,
      name:            user.name,
      clearance_level: user.clearance_level,
      email_verified:  user.email_verified,
    },
  })
}
