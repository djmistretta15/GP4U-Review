'use client'

/**
 * /providers/register — Provider Registration
 * =============================================
 *
 * The entry point for GPU providers — the most consequential onboarding
 * flow on the platform. A provider who joins is committing real resources
 * and consenting to real monitoring.
 *
 * This page must be:
 *   - 100% honest about what joining means
 *   - Clear about stake amounts BEFORE asking for them
 *   - Transparent about the slash/appeal system
 *   - Friction where friction is correct (visibility consent)
 *
 * It is NOT:
 *   - Designed to maximize conversions at the expense of clarity
 *   - Hiding the slash conditions in fine print
 *   - Rushing anyone through a commitment they don't understand
 *
 * After this page → /providers/onboarding for agent install + verification
 */

import { useState, ChangeEvent } from 'react'
import Link from 'next/link'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { StakeRiskCalculator } from '@/components/ui/stake-risk-calculator'

type Tier = 'UNIVERSITY' | 'COMMERCIAL' | null

// ── Stake calculation (mirrors server-side logic) ────────────────────────────
function calcStake(gpuCount: number): { amount: number; perGpu: number } {
  const perGpu = gpuCount <= 4 ? 50 : gpuCount <= 16 ? 35 : 25
  return { amount: perGpu * gpuCount, perGpu }
}

const UNIVERSITY_PERKS = [
  'Zero cash stake — your institution\'s reputation is the commitment',
  'Student program revenue share on every job',
  'Priority routing from enterprise customers who prefer academic supply',
  'Public Veritas trust profile for your research cluster',
  'Direct support for renewable energy attestation + carbon credits',
]

const COMMERCIAL_PERKS = [
  'Start earning from idle hardware in under 10 minutes',
  'Per-GPU cash stake (held in escrow, fully refunded on clean exit)',
  'Live arbitrage routing to maximize your utilization',
  'ZK uptime attestation builds your Veritas Gold/Silver/Bronze badge',
  'Carbon credit revenue when renewable energy ≥ 50%',
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function ProviderRegisterPage() {
  const [tier, setTier]             = useState<Tier>(null)
  const [gpuCount, setGpuCount]     = useState(4)
  const [institution, setInstitution] = useState('')
  const [instEmail, setInstEmail]   = useState('')
  const [mouAccepted, setMouAccepted] = useState(false)
  const [visConsent, setVisConsent] = useState('')   // must type "I CONSENT"
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState<string | null>(null)

  const stake = calcStake(gpuCount)

  const visConsentValid  = visConsent.trim().toUpperCase() === 'I CONSENT'
  const uniFormValid     = institution.trim().length >= 2 && instEmail.includes('.edu') && mouAccepted && visConsentValid
  const commFormValid    = gpuCount >= 1 && visConsentValid

  const canSubmit = tier === 'UNIVERSITY' ? uniFormValid : tier === 'COMMERCIAL' ? commFormValid : false

  const handleSubmit = async () => {
    if (!canSubmit || !tier) return
    setLoading(true)
    setError(null)
    try {
      const payload = tier === 'UNIVERSITY'
        ? { tier, institution_name: institution, institution_email: instEmail, mou_accepted: mouAccepted, visibility_consent: true, gpu_count: 0 }
        : { tier, gpu_count: gpuCount, visibility_consent: true }

      const res = await fetch('/api/providers/onboard', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...payload, node_id: `node_${Date.now()}` }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Registration failed')
      window.location.href = `/providers/onboarding?node_id=${data.node_id}`
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 px-4 py-12">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <div className="text-center mb-10">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-black">G</span>
            </div>
            <span className="text-xl font-black text-slate-900">GP4U</span>
          </Link>
          <h1 className="text-3xl font-black text-slate-900 mb-2">Provide GPU Power</h1>
          <p className="text-slate-500">
            Earn from idle hardware. Trusted by design — not by promise.
          </p>
        </div>

        {/* Step 1: Tier selection */}
        {!tier && (
          <div>
            <h2 className="text-lg font-bold text-slate-900 text-center mb-6">
              What type of provider are you?
            </h2>
            <div className="grid md:grid-cols-2 gap-4">

              {/* University */}
              <button
                onClick={() => setTier('UNIVERSITY')}
                className="text-left rounded-2xl border-2 border-indigo-200 bg-white p-6 hover:border-indigo-400 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                  <span className="text-xl">🏛️</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">University / Research Lab</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  Research clusters, CS departments, HPC centers. Zero cash stake — your institution's reputation is the commitment.
                </p>
                <ul className="space-y-1.5">
                  {UNIVERSITY_PERKS.slice(0, 3).map(p => (
                    <li key={p} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-indigo-500 flex-shrink-0 mt-0.5">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-4 border-t border-indigo-100">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-full border border-indigo-200">
                    $0 cash stake required
                  </span>
                </div>
              </button>

              {/* Commercial */}
              <button
                onClick={() => setTier('COMMERCIAL')}
                className="text-left rounded-2xl border-2 border-cyan-200 bg-white p-6 hover:border-cyan-400 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-100 flex items-center justify-center mb-4 group-hover:bg-cyan-200 transition-colors">
                  <span className="text-xl">⚡</span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mb-1">Commercial Provider</h3>
                <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                  GPU farms, gaming cafes, mining operations, individuals with high-end hardware. Cash stake per GPU, fully refundable on clean exit.
                </p>
                <ul className="space-y-1.5">
                  {COMMERCIAL_PERKS.slice(0, 3).map(p => (
                    <li key={p} className="flex items-start gap-2 text-xs text-slate-600">
                      <span className="text-cyan-500 flex-shrink-0 mt-0.5">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-4 border-t border-cyan-100">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 bg-cyan-50 px-3 py-1.5 rounded-full border border-cyan-200">
                    $25–$50 per GPU (escrow)
                  </span>
                </div>
              </button>

            </div>

            <p className="text-center text-xs text-slate-400 mt-6">
              Not sure?{' '}
              <Link href="/docs/provider-guide" className="text-blue-600 underline">
                Read the provider guide
              </Link>
              {' '}first.
            </p>
          </div>
        )}

        {/* Step 2: Tier-specific form */}
        {tier && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">

            {/* Back button */}
            <div className="px-6 pt-5 pb-0">
              <button
                onClick={() => setTier(null)}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
              >
                ← Change tier
              </button>
              <div className="flex items-center gap-2 mb-6">
                <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${
                  tier === 'UNIVERSITY' ? 'bg-indigo-100 text-indigo-700' : 'bg-cyan-100 text-cyan-700'
                }`}>
                  {tier === 'UNIVERSITY' ? '🏛️ University Provider' : '⚡ Commercial Provider'}
                </span>
              </div>
            </div>

            <div className="px-6 pb-6 space-y-6">

              {/* University-specific fields */}
              {tier === 'UNIVERSITY' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Institution name
                    </label>
                    <input
                      type="text"
                      value={institution}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setInstitution(e.target.value)}
                      placeholder="MIT CSAIL"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      Institutional email
                    </label>
                    <input
                      type="email"
                      value={instEmail}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setInstEmail(e.target.value)}
                      placeholder="you@university.edu"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-all"
                    />
                    {instEmail && !instEmail.includes('.edu') && (
                      <p className="text-xs text-orange-600 mt-1">University tier requires a .edu email address</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        id="mou"
                        type="checkbox"
                        checked={mouAccepted}
                        onChange={e => setMouAccepted(e.target.checked)}
                        className="mt-0.5 flex-shrink-0 w-4 h-4"
                      />
                      <label htmlFor="mou" className="text-xs text-indigo-800 leading-relaxed cursor-pointer">
                        I have the authority to accept the{' '}
                        <Link href="/docs/university-mou" className="underline font-medium">Memorandum of Understanding</Link>
                        {' '}on behalf of my institution. I understand that slash events will be recorded
                        publicly on the Obsidian ledger under the institution's name.
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Commercial: GPU count + stake calculator */}
              {tier === 'COMMERCIAL' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      How many GPUs are you connecting?
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="range"
                        min="1"
                        max="64"
                        value={gpuCount}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setGpuCount(parseInt(e.target.value))}
                        className="flex-1"
                      />
                      <span className="w-16 text-right text-2xl font-bold text-slate-900">{gpuCount}</span>
                    </div>
                  </div>

                  {/* Stake summary */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-1">
                          Your stake requirement
                          <InfoTooltip term="Stake" side="right" />
                        </p>
                        <p className="text-xs text-slate-500">
                          ${stake.perGpu}/GPU × {gpuCount} GPU{gpuCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-slate-900">${stake.amount}</p>
                        <p className="text-xs text-slate-500">held in escrow</p>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500 space-y-1">
                      <p>✓ Fully refunded on clean exit (no pending slashes)</p>
                      <p>✓ Cooling-off period: 7 days after exit request before release</p>
                      <p>✓ Cannot be seized for reasons outside the platform T&C</p>
                    </div>
                  </div>

                  {gpuCount >= 17 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-xs text-amber-800">
                        ⚠ Fleets of 17+ GPUs require a hardware audit call before activation.
                        Our team will reach out within 48 hours of registration.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Slash risk — shown to all providers */}
              <div>
                <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
                  What could go wrong — and what it costs
                  <InfoTooltip term="Slash" side="right" />
                </p>
                <StakeRiskCalculator
                  stakeAmount={stake.amount}
                  gpuCount={gpuCount}
                  tier={tier}
                />
              </div>

              {/* Visibility consent — the critical gate */}
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-5">
                <p className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-1">
                  Hardware Visibility Agreement
                  <InfoTooltip term="VisibilityConsent" side="right" />
                </p>
                <p className="text-xs text-amber-800 leading-relaxed mb-4">
                  As a condition of joining GP4U, you grant the platform full visibility into:
                  GPU utilization, VRAM usage, power draw, temperature, running processes,
                  and outbound network connections — <strong>while jobs are running.</strong>
                  This is non-optional. Blocking or tampering with monitoring results in an
                  immediate hard slash and permanent ejection.
                </p>
                <p className="text-xs text-amber-800 mb-2 font-medium">
                  To confirm you understand and agree, type <strong>I CONSENT</strong> below:
                </p>
                <input
                  type="text"
                  value={visConsent}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setVisConsent(e.target.value)}
                  placeholder="I CONSENT"
                  className={`w-full rounded-xl border-2 px-4 py-3 text-sm font-mono focus:outline-none transition-all ${
                    visConsentValid
                      ? 'border-green-400 bg-green-50 text-green-900'
                      : 'border-amber-300 bg-white text-slate-900'
                  }`}
                />
                {visConsentValid && (
                  <p className="text-xs text-green-700 mt-1 flex items-center gap-1">
                    <span>✓</span> Hardware Visibility Agreement accepted
                  </p>
                )}
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || loading}
                className="w-full rounded-xl bg-blue-600 py-4 text-sm font-bold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
              >
                {loading
                  ? 'Registering node…'
                  : tier === 'UNIVERSITY'
                    ? 'Register Institution → Install Agent'
                    : `Register ${gpuCount} GPU${gpuCount !== 1 ? 's' : ''} → Install Agent`}
              </button>

              <p className="text-center text-xs text-slate-400">
                Already a customer?{' '}
                <Link href="/register" className="text-blue-600">Register as customer</Link>
              </p>

            </div>
          </div>
        )}

      </div>
    </div>
  )
}
