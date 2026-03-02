'use client'

/**
 * AuthProvider — global authentication context
 *
 * Wraps the app and provides:
 *   - user: the authenticated user (or null)
 *   - loading: true while the initial session restore is in progress
 *   - login(email, password): authenticates, stores token, updates context
 *   - logout(): clears tokens server + client side
 *
 * Session restore on page load:
 *   1. Try sessionStorage token first (fast path — no network)
 *   2. If absent/expired, attempt POST /api/auth/refresh (uses HttpOnly cookie)
 *   3. If refresh fails, user is unauthenticated
 *
 * Usage:
 *   const { user, login, logout, loading } = useAuth()
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  getStoredToken,
  storeToken,
  clearStoredToken,
  refreshToken,
} from '@/lib/api-client'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id:              string
  email:           string
  name:            string | null
  clearance_level: number
  email_verified:  boolean
}

interface AuthContextValue {
  user:    AuthUser | null
  loading: boolean
  login:   (email: string, password: string) => Promise<{ error?: string }>
  logout:  () => Promise<void>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  user:    null,
  loading: true,
  login:   async () => ({ error: 'AuthProvider not mounted' }),
  logout:  async () => {},
})

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Session restore on mount ──────────────────────────────────────────────

  useEffect(() => {
    async function restore() {
      // 1. Check sessionStorage for an existing token
      const existing = getStoredToken()
      if (existing) {
        // Token exists — try to fetch current user to validate it
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${existing}` },
          })
          if (res.ok) {
            const data: { user: AuthUser } = await res.json()
            setUser(data.user)
            setLoading(false)
            return
          }
        } catch { /* fall through to refresh */ }
      }

      // 2. Try refresh cookie
      const fresh = await refreshToken()
      if (fresh) {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${fresh}` },
          })
          if (res.ok) {
            const data: { user: AuthUser } = await res.json()
            setUser(data.user)
            setLoading(false)
            return
          }
        } catch { /* fall through */ }
      }

      // 3. Not authenticated
      clearStoredToken()
      setUser(null)
      setLoading(false)
    }

    restore()
  }, [])

  // ── Login ─────────────────────────────────────────────────────────────────

  const login = useCallback(async (
    email:    string,
    password: string,
  ): Promise<{ error?: string }> => {
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) return { error: data.error ?? 'Login failed' }

      storeToken(data.access_token)
      setUser(data.user)
      return {}
    } catch {
      return { error: 'Network error. Please check your connection.' }
    }
  }, [])

  // ── Logout ────────────────────────────────────────────────────────────────

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch { /* ignore network errors during logout */ }
    clearStoredToken()
    setUser(null)
    window.location.href = '/login'
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}
