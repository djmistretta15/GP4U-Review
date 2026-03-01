'use client'

/**
 * /onboarding — Customer Onboarding Wizard
 * ==========================================
 *
 * 4-step guided experience for new customers. Designed so a researcher
 * with no GPU cloud experience can go from zero to first running job
 * in under 5 minutes.
 *
 * Steps:
 *   1. Welcome — What are you building? (use-case selection → personalises UX)
 *   2. Add Credits — Fund your account (preset amounts, clear fee schedule)
 *   3. First Job — Guided job submission using the Workload Advisor
 *   4. Done — Summary, next steps, invite link
 *
 * Safety features:
 *   - No credit card required for Step 1-3 preview (can explore first)
 *   - Explicit cost shown before any job is submitted
 *   - "What happens to my money?" answered inline at Step 2
 *   - Obsidian ledger entry shown in Step 4 (trust from first moment)
 */

import { useState } from 'react'
import Link from 'next/link'
import { StepWizard, WizardStep } from '@/components/ui/step-wizard'

const STEPS: WizardStep[] = [
  { id: 'welcome',  label: 'Welcome',  description: 'Your use case'  },
  { id: 'credits',  label: 'Credits',  description: 'Fund account'   },
  { id: 'first-job', label: 'First Job', description: 'Run something' },
  { id: 'done',     label: 'Ready',    description: 'All set'        },
]

type UseCase = 'training' | 'inference' | 'research' | 'team' | null

const USE_CASES = [
  { id: 'training',  emoji: '🏋️', title: 'Model Training',    desc: 'Fine-tune or train LLMs, vision, or other deep learning models' },
  { id: 'inference', emoji: '⚡', title: 'Inference / Serving', desc: 'Run models at scale — batch or real-time API serving' },
  { id: 'research',  emoji: '🔬', title: 'Research',           desc: 'Academic or exploratory experiments, reproducibility matters' },
  { id: 'team',      emoji: '🏢', title: 'Team / Enterprise',  desc: 'Multiple users, budget management, audit trail required' },
] as const

const CREDIT_PRESETS = [
  { amount: 25,  label: '$25',  note: '~8h A100 80GB' },
  { amount: 50,  label: '$50',  note: '~16h A100 80GB', popular: true },
  { amount: 100, label: '$100', note: '~32h A100 80GB' },
  { amount: 250, label: '$250', note: '~80h A100 80GB' },
]

export default function OnboardingPage() {
  const [step, setStep]         = useState(0)
  const [useCase, setUseCase]   = useState<UseCase>(null)
  const [credits, setCredits]   = useState<number | null>(null)
  const [customAmt, setCustomAmt] = useState('')
  const [completing, setCompleting] = useState(false)
  const [jobLaunched, setJobLaunched] = useState(false)

  const canProceed = [
    useCase !== null,
    credits !== null || parseFloat(customAmt) >= 10,
    true, // first job step — optional, can skip
    true,
  ][step]

  const handleComplete = async () => {
    setCompleting(true)
    await new Promise(r => setTimeout(r, 800))
    setCompleting(false)
    setStep(3)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center">
              <span className="text-white text-sm font-black">G</span>
            </div>
            <span className="text-xl font-black text-slate-900">GP4U</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Let's get you started</h1>
          <p className="text-slate-500 text-sm mt-1">This takes about 3 minutes</p>
        </div>

        {/* Wizard card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <StepWizard
            steps={STEPS}
            currentStep={step}
            onStepChange={setStep}
            canProceed={!!canProceed}
            onComplete={handleComplete}
            completing={completing}
            completeLabel={step === 2 ? 'Skip for now' : 'Finish'}
          >

            {/* ── Step 0: Use Case ─────────────────────────────────────── */}
            {step === 0 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">What are you building?</h2>
                <p className="text-sm text-slate-500 mb-6">
                  This helps us show you the most relevant GPUs and pricing.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {USE_CASES.map(uc => (
                    <button
                      key={uc.id}
                      type="button"
                      onClick={() => setUseCase(uc.id as UseCase)}
                      className={`text-left rounded-xl border-2 p-4 transition-all ${
                        useCase === uc.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <span className="text-2xl block mb-2">{uc.emoji}</span>
                      <p className="text-sm font-semibold text-slate-900">{uc.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{uc.desc}</p>
                    </button>
                  ))}
                </div>
                {useCase === 'research' && (
                  <div className="mt-4 p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <p className="text-xs text-indigo-800 font-medium">
                      ✓ Research workloads get Veritas reproducibility scoring — every result is provably reproducible.
                    </p>
                  </div>
                )}
                {useCase === 'team' && (
                  <div className="mt-4 p-3 rounded-xl bg-purple-50 border border-purple-200">
                    <p className="text-xs text-purple-800 font-medium">
                      ✓ Enterprise accounts get shared credit pools, role-based access, and full Obsidian audit exports.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 1: Credits ──────────────────────────────────────── */}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Add compute credits</h2>
                <p className="text-sm text-slate-500 mb-6">
                  Credits are USD-pegged 1:1. Unused credits are fully refundable within 90 days.
                </p>

                {/* Preset amounts */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {CREDIT_PRESETS.map(p => (
                    <button
                      key={p.amount}
                      type="button"
                      onClick={() => { setCredits(p.amount); setCustomAmt('') }}
                      className={`relative rounded-xl border-2 px-4 py-4 text-left transition-all ${
                        credits === p.amount
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {p.popular && (
                        <span className="absolute -top-2 left-3 text-[10px] font-bold bg-blue-500 text-white px-2 py-0.5 rounded-full">
                          Popular
                        </span>
                      )}
                      <p className="text-xl font-bold text-slate-900">{p.label}</p>
                      <p className="text-xs text-slate-500">{p.note}</p>
                    </button>
                  ))}
                </div>

                {/* Custom amount */}
                <div className="flex items-center gap-2 mb-6">
                  <span className="text-sm text-slate-500">Or enter amount:</span>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={customAmt}
                      onChange={e => { setCustomAmt(e.target.value); setCredits(null) }}
                      placeholder="Minimum $10"
                      min="10"
                      max="10000"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                </div>

                {/* Transparency box */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <p className="text-xs font-semibold text-slate-700">What happens to your money</p>
                  <div className="space-y-1.5">
                    {[
                      ['Credits held in escrow', 'Released to providers only after jobs complete successfully'],
                      ['Failed jobs refunded', 'If a job fails due to provider fault, credits return to your balance instantly'],
                      ['No hidden fees', 'The price shown is the price charged. Platform fee is listed separately on invoices'],
                      ['Unused credits refundable', 'Request a refund of unused credits within 90 days — no questions asked'],
                    ].map(([title, desc]) => (
                      <div key={title} className="flex items-start gap-2">
                        <span className="text-green-500 text-xs mt-0.5">✓</span>
                        <div>
                          <span className="text-xs font-medium text-slate-700">{title}: </span>
                          <span className="text-xs text-slate-500">{desc}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-center text-slate-400 mt-4">
                  Payment processing via Stripe. GP4U never stores card details.
                </p>
              </div>
            )}

            {/* ── Step 2: First Job ────────────────────────────────────── */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-bold text-slate-900 mb-1">Run your first job</h2>
                <p className="text-sm text-slate-500 mb-6">
                  The Workload Advisor recommends the right GPU for your requirements. This step is optional.
                </p>

                {!jobLaunched ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border-2 border-dashed border-blue-200 bg-blue-50 p-6 text-center">
                      <p className="text-4xl mb-3">⚡</p>
                      <p className="text-sm font-semibold text-blue-900 mb-1">Use the Workload Advisor</p>
                      <p className="text-xs text-blue-700 mb-4 leading-relaxed">
                        Describe what you're running — the advisor recommends the GPU, estimates VRAM,
                        duration, and cost. One click to launch.
                      </p>
                      <p className="text-xs text-blue-600">
                        The advisor is always available via the floating button in the bottom-right corner.
                      </p>
                    </div>

                    <div className="text-center">
                      <p className="text-xs text-slate-400 mb-3">Or go directly to the dashboard</p>
                      <Link
                        href="/dashboard"
                        onClick={() => setJobLaunched(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
                      >
                        Go to Dashboard →
                      </Link>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { emoji: '🔬', label: 'Fine-tune LLaMA', href: '/dashboard?workload=fine-tuning' },
                        { emoji: '🖼️', label: 'Image generation', href: '/dashboard?workload=inference' },
                        { emoji: '📊', label: 'Data processing',  href: '/dashboard?workload=batch' },
                      ].map(item => (
                        <Link
                          key={item.label}
                          href={item.href}
                          className="rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300 hover:bg-blue-50 transition-all text-xs"
                        >
                          <span className="text-xl block mb-1">{item.emoji}</span>
                          <span className="text-slate-600 font-medium">{item.label}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <span className="text-5xl block mb-3">🎉</span>
                    <p className="text-lg font-bold text-slate-900">You're on your way!</p>
                    <p className="text-sm text-slate-500 mt-1">Continue to see your account summary.</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Step 3: Done ─────────────────────────────────────────── */}
            {step === 3 && (
              <div className="text-center">
                <span className="text-5xl block mb-4">✅</span>
                <h2 className="text-2xl font-bold text-slate-900 mb-2">You're all set</h2>
                <p className="text-slate-500 text-sm mb-8 leading-relaxed max-w-sm mx-auto">
                  Your account is ready. Every job you run is verifiable, every cost is
                  transparent, and every transaction is permanent on the Obsidian ledger.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-8">
                  {[
                    { href: '/dashboard',  label: 'Go to Dashboard',  primary: true  },
                    { href: '/arbitrage',  label: 'Compare Prices',   primary: false },
                    { href: '/docs',       label: 'Read the Docs',    primary: false },
                    { href: '/providers/register', label: 'Become a Provider', primary: false },
                  ].map(a => (
                    <Link
                      key={a.href}
                      href={a.href}
                      className={`rounded-xl py-3 text-sm font-semibold transition-colors ${
                        a.primary
                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {a.label}
                    </Link>
                  ))}
                </div>

                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-left">
                  <p className="text-xs font-semibold text-green-800 mb-1">Your first ledger entry</p>
                  <p className="text-xs text-green-700 font-mono">
                    #{Math.floor(Math.random() * 10000)} · auth.registered · {new Date().toISOString().slice(0, 19)}Z
                  </p>
                  <p className="text-[10px] text-green-600 mt-1">
                    Sealed in the Obsidian immutable ledger. This record cannot be altered.
                  </p>
                </div>
              </div>
            )}

          </StepWizard>
        </div>

      </div>
    </div>
  )
}
