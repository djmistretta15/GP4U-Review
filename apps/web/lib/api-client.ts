/**
 * API client — authenticated fetch wrapper
 *
 * All client-side API calls go through `apiFetch()`.
 * It automatically:
 *   - Attaches the Authorization: Bearer header
 *   - Retries once with a refreshed token on 401
 *   - Redirects to /login if refresh also fails
 *
 * Token storage strategy:
 *   - Access token: sessionStorage (survives F5, cleared on tab close)
 *   - Refresh token: HttpOnly cookie (set by server, never readable by JS)
 *
 * This file is client-only. Never import it in server components or API routes.
 */

'use client'

// ─── Token store ──────────────────────────────────────────────────────────────

const SESSION_KEY = 'gp4u_access_token'

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(SESSION_KEY)
}

export function storeToken(token: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(SESSION_KEY, token)
}

export function clearStoredToken(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(SESSION_KEY)
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

let _refreshing: Promise<string | null> | null = null

/**
 * Attempt to get a fresh access token via the HttpOnly refresh cookie.
 * Deduplicates concurrent refresh calls so only one fires at a time.
 */
export async function refreshToken(): Promise<string | null> {
  if (_refreshing) return _refreshing

  _refreshing = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' })
      if (!res.ok) return null
      const data: { access_token: string } = await res.json()
      storeToken(data.access_token)
      return data.access_token
    } catch {
      return null
    } finally {
      _refreshing = null
    }
  })()

  return _refreshing
}

// ─── Authenticated fetch ───────────────────────────────────────────────────────

export type ApiFetchOptions = RequestInit & {
  /** Skip automatic Content-Type: application/json header */
  rawBody?: boolean
}

/**
 * Drop-in replacement for fetch() that handles auth automatically.
 *
 * Usage:
 *   const res = await apiFetch('/api/jobs', { method: 'POST', body: JSON.stringify(data) })
 *   if (!res.ok) { ... }
 *   const json = await res.json()
 */
export async function apiFetch(
  path: string,
  options: ApiFetchOptions = {},
  _retry = true,
): Promise<Response> {
  const token = getStoredToken()

  const headers: Record<string, string> = {
    ...(options.rawBody ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> ?? {}),
  }

  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(path, { ...options, headers })

  // 401 → try refresh once
  if (res.status === 401 && _retry) {
    const fresh = await refreshToken()
    if (fresh) {
      return apiFetch(path, options, false)
    }
    // Refresh failed — redirect to login
    clearStoredToken()
    if (typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname + window.location.search)
      window.location.href = `/login?next=${next}`
    }
  }

  return res
}
