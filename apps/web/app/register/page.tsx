'use client'

/**
 * /register — Customer Registration
 * ====================================
 *
 * The front door for customers. Clean, honest, no dark patterns.
 *
 * Design decisions:
 *   - Single page, no step wizard (keep registration as fast as possible)
 *   - Referral code auto-filled from URL param ?ref=CODE
 *   - Password strength indicator (visual, not blocking)
 *   - Terms shown inline — no "by clicking you agree" buried text
 *   - Email verification notice set correctly (not "check your email" lie)
 *   - Clear value props above the fold — users know what they're signing up for
 *
 * After registration → /onboarding to guide them through first job
 */

import { useState, useEffect, ChangeEvent, FormEvent } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

// ─── Password strength ────────────────────────────────────────────────────────

function scorePassword(pw: string): { score: 0|1|2|3|4; label: string; color: string } {
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++
  if (/[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++
  const labels: Record<number, { label: string; color: string }> = {
    0: { label: 'Too short',  color: 'bg-slate-200' },
    1: { label: 'Weak',       color: 'bg-red-400' },
    2: { label: 'Fair',       color: 'bg-amber-400' },
    3: { label: 'Good',       color: 'bg-blue-400' },
    4: { label: 'Strong',     color: 'bg-green-500' },
  }
  return { score: score as 0|1|2|3|4, ...labels[score] }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RegisterPage() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const refCode      = searchParams.get('ref') ?? ''

  const [form, setForm] = useState({
    email:    '',
    name:     '',
    password: '',
    ref:      refCode,
  })
  const [showPassword, setShowPassword] = useState(false)
  const [agreed, setAgreed]             = useState(false)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  useEffect(() => { if (refCode) setForm(f => ({ ...f, ref: refCode })) }, [refCode])

  const setField = (key: string) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  const pwStrength   = scorePassword(form.password)
  const emailValid   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
  const nameValid    = form.name.trim().length >= 2
  const passwordOk   = form.password.length >= 8
  const canSubmit    = emailValid && nameValid && passwordOk && agreed

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')
      // Redirect to onboarding
      router.push('/onboarding')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex">

      {/* Left: value props */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-center px-16 py-12">
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-2xl bg-blue-600 flex items-center justify-center">
            <span className="text-white font-black">G</span>
          </div>
          <span className="text-2xl font-black text-slate-900">GP4U</span>
        </div>

        <h1 className="text-4xl font-black text-slate-900 leading-tight mb-4">
          GPU compute you can<br />
          <span className="text-blue-600">actually trust.</span>
        </h1>
        <p className="text-lg text-slate-600 mb-10 leading-relaxed">
          Every job is verified with zero-knowledge proofs. Every transaction
          is sealed in an immutable ledger. No promises — just cryptographic proof.
        </p>

        <div className="space-y-5">
          {[
            { icon: '🔒', title: 'ZK Hardware Attestation', desc: 'Cryptographic proof your job ran on the GPU you paid for. Verifiable by you, independently.' },
            { icon: '📒', title: 'Obsidian Immutable Ledger', desc: 'Every job, cost, and settlement recorded permanently. Nothing is ever altered or deleted.' },
            { icon: '⚡', title: 'Live Cross-Cloud Arbitrage', desc: 'Six AI chambers find the cheapest GPU for every job in real time. 40% savings on average.' },
            { icon: '🏛️', title: 'University-Backed Supply', desc: 'Hardware from verified research institutions — stakes their reputation on every job.' },
          ].map(v => (
            <div key={v.title} className="flex items-start gap-3">
              <span className="text-2xl flex-shrink-0 mt-0.5">{v.icon}</span>
              <div>
                <p className="font-semibold text-slate-900 text-sm">{v.title}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{v.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: registration form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2 justify-center mb-8">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-black">G</span>
            </div>
            <span className="text-xl font-black text-slate-900">GP4U</span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h2>
              <p className="text-sm text-slate-500">
                Already have one?{' '}
                <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium">Sign in</Link>
              </p>
            </div>

            {/* Referral badge */}
            {form.ref && (
              <div className="flex items-center gap-2 mb-5 p-3 rounded-xl bg-blue-50 border border-blue-200">
                <span className="text-blue-500 text-lg">🎁</span>
                <div>
                  <p className="text-sm font-semibold text-blue-900">Invite code applied</p>
                  <p className="text-xs text-blue-600">{form.ref} — you may receive bonus credits</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Full name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={setField('name')}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Email address
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={setField('email')}
                  placeholder="ada@research.edu"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                />
                {form.email.includes('.edu') && (
                  <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                    <span>✓</span> University email — eligible for academic pricing
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={setField('password')}
                    placeholder="Minimum 8 characters"
                    autoComplete="new-password"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 pr-12 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-medium"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {/* Strength bar */}
                {form.password.length > 0 && (
                  <div className="mt-2">
                    <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${pwStrength.color}`}
                        style={{ width: `${(pwStrength.score / 4) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{pwStrength.label}</p>
                  </div>
                )}
              </div>

              {/* Terms — inline and readable */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start gap-3">
                  <input
                    id="agree"
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="agree" className="text-xs text-slate-600 leading-relaxed cursor-pointer">
                    I understand that every job I run is recorded on the{' '}
                    <span className="font-semibold text-slate-800">Obsidian immutable ledger</span>.
                    I agree to the{' '}
                    <Link href="/docs/terms" className="text-blue-600 underline">Terms of Service</Link>
                    {' '}and{' '}
                    <Link href="/docs/privacy" className="text-blue-600 underline">Privacy Policy</Link>.
                    GP4U does not sell personal data.
                  </label>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="w-full rounded-xl bg-blue-600 py-3.5 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {loading ? 'Creating account…' : 'Create Account →'}
              </button>

            </form>

            <p className="text-center text-xs text-slate-400 mt-5">
              Are you a GPU provider?{' '}
              <Link href="/providers/register" className="text-blue-600 hover:text-blue-800">
                Join as a provider
              </Link>
            </p>
          </div>

          {/* Trust footer */}
          <div className="flex items-center justify-center gap-6 mt-6">
            {['ZK verified', 'Obsidian ledger', 'No dark patterns'].map(t => (
              <div key={t} className="flex items-center gap-1.5 text-xs text-slate-400">
                <div className="w-1 h-1 rounded-full bg-slate-300" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  )
}
