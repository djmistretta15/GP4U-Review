'use client'

/**
 * UserMenu — top-right user control in the app shell header
 *
 * States:
 *   loading  → skeleton (prevents layout shift)
 *   signed out → "Sign in" button
 *   signed in  → avatar + name + dropdown (Dashboard, Billing, Sign out)
 */

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useAuth } from '@/components/auth-provider'

export function UserMenu() {
  const { user, loading, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border border-slate-200 bg-slate-50 animate-pulse">
        <div className="w-5 h-5 rounded-full bg-slate-200" />
        <div className="w-20 h-3 rounded bg-slate-200" />
      </div>
    )
  }

  // ── Signed out ──────────────────────────────────────────────────────────────

  if (!user) {
    return (
      <Link
        href="/login"
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
      >
        Sign in
      </Link>
    )
  }

  // ── Signed in ───────────────────────────────────────────────────────────────

  const initials = (user.name ?? user.email)
    .split(' ')
    .map(s => s[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const displayName = user.name ?? user.email.split('@')[0]
  const isAdmin     = user.clearance_level >= 3

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 border border-slate-200 bg-slate-50 cursor-pointer hover:bg-white transition-colors"
        title="Account menu"
      >
        <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[9px] font-bold">{initials}</span>
        </div>
        <span className="text-xs font-medium text-slate-700 max-w-[80px] truncate">
          {displayName}
        </span>
        {isAdmin && (
          <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1 rounded">
            ADMIN
          </span>
        )}
        <svg
          className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 rounded-xl border border-slate-200 bg-white shadow-lg z-50">
          {/* User info */}
          <div className="px-3 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-800 truncate">{user.name ?? 'Account'}</p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
            {!user.email_verified && (
              <p className="text-[10px] text-amber-600 mt-1">⚠ Email not verified</p>
            )}
          </div>

          {/* Nav links */}
          <div className="py-1">
            {[
              { href: '/dashboard', label: 'Dashboard' },
              { href: '/billing',   label: 'Billing & Credits' },
              { href: '/help',      label: 'Help Centre' },
              ...(isAdmin ? [{ href: '/admin', label: 'Admin Panel' }] : []),
            ].map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Sign out */}
          <div className="border-t border-slate-100 py-1">
            <button
              type="button"
              onClick={() => { setOpen(false); logout() }}
              className="flex items-center w-full px-3 py-2 text-xs text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
