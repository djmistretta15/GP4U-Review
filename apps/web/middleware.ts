/**
 * Next.js Middleware — Custodes Gate
 *
 * CRITICAL SECURITY PROPERTIES:
 *   - x-subject-id is NEVER trusted from the client — set ONLY after token verify
 *   - 'demo-subject-id' is explicitly rejected — fails closed, not open
 *   - Admin routes require clearance >= 3 in the verified token payload
 *   - Provider telemetry uses a separate per-job provider-token scheme
 *   - CORS enforced against an allowlist; security headers on every response
 *
 * Token format (Phase 1 — HMAC-SHA256):
 *   base64url(JSON payload).base64url(HMAC-SHA256 signature)
 *   payload: { sub: UUID, clr: 0-5, trs: 0-100, exp: unix_ms }
 *
 * Phase 2 upgrade: replace verifyToken() with DexteraPassportService.verify() (RS256)
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'

const OPEN_ROUTES = new Set([
  '/api/health/public',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
])

const PROVIDER_TOKEN_ROUTES = new Set(['/api/telemetry/russian-doll'])

const ADMIN_ROUTES = new Set(['/api/admin/chambers', '/api/admin/ledger'])

const ALLOWED_ORIGINS = new Set([
  'https://gp4u.com',
  'https://www.gp4u.com',
  'https://app.gp4u.com',
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:3001']
    : []),
])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin':      allowed || 'null',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods':     'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers':     'Authorization,Content-Type,X-Correlation-Id',
    'Access-Control-Max-Age':           '86400',
    'Vary':                             'Origin',
  }
}

function base64UrlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/')
    .padEnd(str.length + (4 - str.length % 4) % 4, '=')
  const binary = atob(padded)
  const bytes  = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

async function verifyToken(
  token: string
): Promise<{ subject_id: string; clearance: number; trust_score: number } | null> {
  const secret = process.env.GP4U_TOKEN_SECRET

  if (process.env.NODE_ENV !== 'production' && !secret) {
    const dev = process.env.GP4U_DEV_SUBJECT_ID
    if (dev && UUID_RE.test(dev)) return { subject_id: dev, clearance: 1, trust_score: 80 }
    return null
  }
  if (!secret) {
    console.error('[middleware] GP4U_TOKEN_SECRET not set')
    return null
  }

  try {
    const dot = token.lastIndexOf('.')
    if (dot < 1) return null
    const payload_b64 = token.slice(0, dot)
    const sig_b64     = token.slice(dot + 1)
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    )
    const valid = await crypto.subtle.verify(
      'HMAC', key, base64UrlDecode(sig_b64), new TextEncoder().encode(payload_b64)
    )
    if (!valid) return null
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload_b64)))
    if (payload.exp && Date.now() > payload.exp) return null
    if (!UUID_RE.test(payload.sub ?? '')) return null
    return {
      subject_id:  String(payload.sub),
      clearance:   typeof payload.clr === 'number' ? Number(payload.clr) : 0,
      trust_score: typeof payload.trs === 'number' ? Number(payload.trs) : 0,
    }
  } catch { return null }
}

export async function middleware(request: NextRequest) {
  const { pathname }   = request.nextUrl
  const origin         = request.headers.get('origin')
  const correlation_id = uuidv4()

  const baseHeaders: Record<string, string> = {
    ...corsHeaders(origin),
    'x-correlation-id':       correlation_id,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options':        'DENY',
    'Referrer-Policy':        'strict-origin-when-cross-origin',
    'Permissions-Policy':     'camera=(), microphone=(), geolocation=()',
  }

  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: baseHeaders })
  }

  if (OPEN_ROUTES.has(pathname)) {
    const res = NextResponse.next()
    Object.entries(baseHeaders).forEach(([k, v]) => res.headers.set(k, v))
    return res
  }

  const raw_auth = request.headers.get('Authorization')
  const token    = raw_auth?.startsWith('Bearer ') ? raw_auth.slice(7) : null

  if (PROVIDER_TOKEN_ROUTES.has(pathname)) {
    if (!token || token.length < 32) {
      return NextResponse.json({ error: 'Valid provider token required' }, { status: 401, headers: baseHeaders })
    }
    const res = NextResponse.next()
    Object.entries(baseHeaders).forEach(([k, v]) => res.headers.set(k, v))
    res.headers.set('x-provider-token', token)
    return res
  }

  if (!token) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401, headers: baseHeaders })
  }

  const verified = await verifyToken(token)
  if (!verified) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: baseHeaders })
  }

  if (ADMIN_ROUTES.has(pathname) && verified.clearance < 3) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403, headers: baseHeaders })
  }

  const res = NextResponse.next()
  Object.entries(baseHeaders).forEach(([k, v]) => res.headers.set(k, v))
  res.headers.set('x-subject-id',      verified.subject_id)
  res.headers.set('x-clearance-level', String(verified.clearance))
  res.headers.set('x-trust-score',     String(verified.trust_score))
  return res
}

export const config = { matcher: ['/api/:path*'] }
