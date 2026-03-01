'use client'

/**
 * /login — Customer Login
 * ========================
 *
 * Authenticates the user via email + password.
 * On success: stores access token in memory (or sessionStorage) and
 * refresh token is set as HttpOnly cookie by the server.
 *
 * Design: mirrors the register page — clean, no dark patterns.
 */

import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const redirectTo   = searchParams.get('next') ?? '/dashboard'
  const justVerified = searchParams.get('verified') === '1'

  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
    setError(null)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: form.email, password: form.password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Login failed. Please try again.')
        return
      }

      // Store access token in sessionStorage (cleared on tab close)
      // The refresh token lives in an HttpOnly cookie (set by the server)
      sessionStorage.setItem('gp4u_access_token', data.access_token)

      router.push(redirectTo)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0a0a0a]">
      {/* Left panel — value props (hidden on mobile) */}
      <div className="hidden w-[480px] shrink-0 flex-col justify-between border-r border-white/5 bg-[#0d0d0d] p-12 lg:flex">
        <div>
          <span className="text-sm font-semibold tracking-widest text-green-400">GP4U</span>
        </div>
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold leading-tight text-white">
              Welcome back to trusted GPU compute.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Every job verified by zero-knowledge proofs.
              Every dollar tracked in the Obsidian ledger.
            </p>
          </div>
          <div className="space-y-4">
            {[
              { icon: '🔐', label: 'ZK Hardware Attestation',   desc: 'Your job ran on the declared hardware — provably.' },
              { icon: '📒', label: 'Obsidian Immutable Ledger', desc: 'Every charge hash-chained and tamper-evident.' },
              { icon: '⚡', label: 'Live Cross-Cloud Arbitrage', desc: 'Cheapest GPU across AWS, GCP, Lambda, RunPod.' },
            ].map(item => (
              <div key={item.label} className="flex gap-3">
                <span className="mt-0.5 text-lg">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-slate-200">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-600">
          © {new Date().getFullYear()} GP4U. All rights reserved.
        </p>
      </div>

      {/* Right panel — login form */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <span className="text-sm font-semibold tracking-widest text-green-400">GP4U</span>
          </div>

          <h2 className="text-2xl font-bold text-white">Sign in</h2>
          <p className="mt-2 text-sm text-slate-400">
            Don't have an account?{' '}
            <Link href="/register" className="text-green-400 hover:underline">
              Create one for free
            </Link>
          </p>

          {/* Email verified success banner */}
          {justVerified && (
            <div className="mt-4 rounded-lg border border-green-900/50 bg-green-950/30 px-4 py-3">
              <p className="text-sm text-green-400">
                ✓ Email verified! Sign in to start using GP4U.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            {/* Error message */}
            {error && (
              <div className="rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
              />
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="text-sm font-medium text-slate-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs text-slate-500 hover:text-slate-300"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-green-500/50 focus:outline-none focus:ring-1 focus:ring-green-500/30"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !form.email || !form.password}
              className="w-full rounded-lg bg-green-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-slate-600">
            By signing in, you agree to our{' '}
            <a href="/docs/terms" className="hover:text-slate-400">Terms of Service</a>
            {' '}and{' '}
            <a href="/docs/privacy" className="hover:text-slate-400">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  )
}
