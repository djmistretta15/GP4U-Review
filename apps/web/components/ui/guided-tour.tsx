'use client'

/**
 * GuidedTour — interactive floating walkthrough panel
 * ====================================================
 *
 * Renders a floating card (bottom-right) that walks the user through
 * a series of contextual steps for any given feature area.
 *
 * Usage:
 *   <GuidedTour tourId="getting-started" />
 *
 * The component shows a "Start Tour" button. Clicking it activates
 * the step-by-step panel. Progress is saved in localStorage so
 * completed tours show a "Revisit" label instead.
 */

import { useState, useEffect, useCallback } from 'react'

// ── Tour definitions ──────────────────────────────────────────────────────────

export interface TourStep {
  title: string
  body:  string
  icon:  string
  hint?: string  // Text hint pointing at a relevant UI element
}

const TOURS: Record<string, { title: string; steps: TourStep[] }> = {

  'getting-started': {
    title: 'Getting Started',
    steps: [
      {
        title: 'Welcome to GP4U',
        icon:  '🚀',
        body:  'GP4U is a marketplace for trusted, verified GPU compute. You pay only for what you use, every transaction is sealed in an immutable ledger, and you can independently verify what hardware ran your job.',
      },
      {
        title: 'Create your account',
        icon:  '👤',
        body:  'Go to /register. Enter your email, name, and password. If you have a .edu email, you automatically qualify for academic pricing. No credit card required to sign up.',
        hint:  'Click "Sign Up" in the header, or go to /register directly.',
      },
      {
        title: 'Add compute credits',
        icon:  '💳',
        body:  'Credits are USD-pegged 1:1. $50 in credits = $50 of compute time. Every addition is sealed in the Obsidian ledger — your balance is always independently verifiable.',
        hint:  'Open Billing in the sidebar → Add Credits panel on the right.',
      },
      {
        title: 'Browse the marketplace',
        icon:  '🛒',
        body:  'The Arbitrage page shows real-time GPU prices across all cloud providers. Filter by VRAM, workload type, or Veritas reliability tier. One click to book the cheapest match.',
        hint:  'Click "Arbitrage" in the left sidebar →',
      },
      {
        title: 'Submit your first job',
        icon:  '⚡',
        body:  'Pick a GPU, set your duration, and upload your script. The platform matches you to the best available hardware and starts your job within seconds.',
        hint:  'Click "Dashboard" → "New Job" button in the top right.',
      },
      {
        title: "You're all set",
        icon:  '✅',
        body:  "That's the full loop. Your credits sit in escrow until the job completes successfully — if anything goes wrong on the provider's side, your credits come back automatically.",
      },
    ],
  },

  'safety': {
    title: 'Safety & Trust',
    steps: [
      {
        title: 'Your money is always protected',
        icon:  '🔒',
        body:  'When you book a GPU, your credits move into escrow — they are locked, not paid. The provider only receives payment after your job completes and is verified. A failed job returns your credits automatically.',
      },
      {
        title: 'Providers post real stakes',
        icon:  '⚖️',
        body:  'Every commercial provider locks $25–$50 per GPU in escrow before going live. If they drop a job, overclaim VRAM, or block monitoring, they lose a portion of that stake — automatically.',
        hint:  'See the Providers guide → Slash Conditions table for all 13 rules.',
      },
      {
        title: 'ZK proof after every job',
        icon:  '🔬',
        body:  "After your job, the provider agent generates a zero-knowledge proof: exact hardware model, VRAM used, energy consumed, uptime %. You can verify this proof yourself — GP4U doesn't need to be trusted.",
        hint:  'Dashboard → your completed job → "View ZK Proof"',
      },
      {
        title: 'The Obsidian ledger cannot be altered',
        icon:  '📚',
        body:  "Every job, payment, slash, and proof is sealed in a hash-chained ledger. No one — not even GP4U — can edit a past entry. If you ever need to audit anything, every block is there permanently.",
        hint:  'Admin → Obsidian Ledger to see live blocks.',
      },
      {
        title: 'Dispute resolution',
        icon:  '🤝',
        body:  'Disagree with a job outcome? File a dispute within 30 days. Evidence from the Obsidian ledger and ZK proofs drives the decision. Both parties can submit their evidence. The outcome is logged permanently.',
      },
    ],
  },

  'marketplace': {
    title: 'Using the Marketplace',
    steps: [
      {
        title: 'Real-time prices, every minute',
        icon:  '📊',
        body:  "The arbitrage engine tracks GPU prices across AWS, Google Cloud, Azure, RunPod, Lambda, CoreWeave, and Vast.ai. The same A100 can differ by 40% between providers — we find the gap for you.",
        hint:  'Open the Arbitrage page in the sidebar →',
      },
      {
        title: 'Filter by what matters to you',
        icon:  '🔍',
        body:  'Sort by price, VRAM, region, or Veritas reliability tier. Filter to Veritas Gold (99.5%+ uptime) when reliability is critical, or sort by price to minimise cost.',
        hint:  'Use the filter bar at the top of the Arbitrage page.',
      },
      {
        title: 'Choosing the right GPU',
        icon:  '🖥️',
        body:  "Training needs VRAM — an A100 80GB covers most LLMs. Inference needs speed — RTX 4090 is cost-effective. Fine-tuning sits in between. Not sure? Use the Workload Advisor.",
      },
      {
        title: 'Workload Advisor',
        icon:  '🧠',
        body:  "Drop your model file or config onto the Workload Advisor (floating button, bottom right). It reads the model size and recommends the minimum GPU and VRAM you need.",
        hint:  'Look for the floating widget in the bottom-right corner.',
      },
      {
        title: 'Book your GPU',
        icon:  '✅',
        body:  'Select a GPU, set duration, confirm. Credits move to escrow instantly and your job is queued. Most jobs start within 30 seconds of booking.',
      },
    ],
  },

  'memory-pooling': {
    title: 'Memory Pooling',
    steps: [
      {
        title: 'Stake idle VRAM for yield',
        icon:  '🏦',
        body:  "When your GPU isn't running a job, you can stake its VRAM into the GP4U memory pool. Jobs that need extra memory can use your capacity, and you earn yield per GB per second.",
      },
      {
        title: 'How yield is calculated',
        icon:  '📈',
        body:  'Yield rate = base rate × demand multiplier. During peak AI training periods, VRAM is in high demand and rates spike. Rates update every 10 minutes and are shown live on the Memory page.',
        hint:  'Memory page → hover "Yield Rate" to see the current formula.',
      },
      {
        title: 'University vs Commercial staking',
        icon:  '🏫',
        body:  'University providers stake their institution\'s reputation (no cash). Commercial providers post cash escrow. Both earn the same yield rate — the only difference is the stake type and slash consequences.',
      },
      {
        title: 'Understand the risks first',
        icon:  '⚠️',
        body:  "If your hardware goes offline while memory is staked, or fails to serve a memory request, you can receive a slash. Make sure your hardware is stable before staking large amounts.",
        hint:  'Read the Safety guide → slash conditions before staking.',
      },
      {
        title: 'How to stake',
        icon:  '💾',
        body:  'Memory → select your GPU → enter the GB amount → confirm. The Mnemo chamber records your stake and starts routing memory-hungry jobs toward you.',
        hint:  'Click "Memory" in the sidebar, then "Stake Memory" →',
      },
    ],
  },

  'providers': {
    title: 'Becoming a Provider',
    steps: [
      {
        title: 'Who can join?',
        icon:  '🏗️',
        body:  'Anyone with a CUDA-capable NVIDIA GPU and a stable internet connection. Universities join with a .edu email and MOU. Commercial operators post a per-GPU cash stake. Students and researchers are free.',
      },
      {
        title: 'Choose your tier',
        icon:  '🎓',
        body:  'University: free to join, revenue share with student programs, .edu email required. Commercial: $25–50/GPU cash stake, immediate start after verification, higher earnings per GPU-hour.',
        hint:  'Go to /providers/register to select your tier.',
      },
      {
        title: 'Install the agent — one command',
        icon:  '⬇️',
        body:  'The GP4U provider agent is a single Docker command. It runs in read-only mode for hardware monitoring and connects back over an encrypted channel. No open firewall ports needed.',
        hint:  '/providers/onboarding shows the exact install command.',
      },
      {
        title: 'Hardware visibility is required',
        icon:  '👁️',
        body:  "The agent monitors your GPU while jobs run: utilisation, VRAM, power, temperature, network. This is non-negotiable — it's what makes the platform trustworthy for everyone. You consent explicitly during setup.",
      },
      {
        title: '13 slash conditions',
        icon:  '⚡',
        body:  'Three warning conditions (logged, no penalty). Five soft slashes (% stake deducted, appeal window open). Five hard slashes (full ejection, stake forfeited). Most common: VRAM overclaiming and job abandonment.',
        hint:  'See the full table on the Providers help page →',
      },
      {
        title: 'Start earning',
        icon:  '💰',
        body:  'Once your agent connects and hardware is verified, you enter the routing pool. Payments settle after each job. Earnings appear in Billing → Provider Earnings section.',
      },
    ],
  },

  'billing': {
    title: 'Billing & Payments',
    steps: [
      {
        title: 'Your balance lives in the ledger',
        icon:  '📒',
        body:  'Your balance = sum of all credits added − sum of all job costs. This is derived from the Obsidian ledger, not a stored field. Your balance is always independently auditable.',
        hint:  'Click "Billing" in the sidebar to see your current balance.',
      },
      {
        title: 'Adding credits',
        icon:  '➕',
        body:  "Choose a preset ($25, $50, $100, $250) or enter a custom amount (min $10). Credits are available immediately after Stripe payment confirmation.",
        hint:  'Add Credits panel on the right side of the Billing page.',
      },
      {
        title: 'The fee schedule — no surprises',
        icon:  '📋',
        body:  'Platform fee: 5% of credit value. Payment processing: Stripe 2.9% + $0.30. These are shown before you confirm every transaction — no hidden fees, ever.',
        hint:  'Click "See fee schedule" below the Add Credits button.',
      },
      {
        title: 'Every transaction is traceable',
        icon:  '📜',
        body:  'Each credit addition and job cost appears in the transaction list with a timestamp and ledger block reference. Nothing is hidden or batched.',
        hint:  'See the transaction list on the left side of the Billing page.',
      },
      {
        title: '90-day refund policy',
        icon:  '↩️',
        body:  'Unused credits are fully refundable within 90 days — no questions asked. Failed jobs return credits automatically. Completed jobs are non-refundable.',
      },
    ],
  },

}

// ── Component ─────────────────────────────────────────────────────────────────

interface GuidedTourProps {
  tourId:    keyof typeof TOURS
  className?: string
}

export function GuidedTour({ tourId, className = '' }: GuidedTourProps) {
  const tour = TOURS[tourId]
  const [active,  setActive]  = useState(false)
  const [step,    setStep]    = useState(0)
  const [done,    setDone]    = useState(false)
  const storageKey = `gp4u_tour_done_${tourId}`

  useEffect(() => {
    setDone(localStorage.getItem(storageKey) === '1')
  }, [storageKey])

  const start = useCallback(() => {
    setStep(0)
    setActive(true)
  }, [])

  const finish = useCallback(() => {
    setActive(false)
    setDone(true)
    localStorage.setItem(storageKey, '1')
  }, [storageKey])

  const next = useCallback(() => {
    if (step < tour.steps.length - 1) {
      setStep(s => s + 1)
    } else {
      finish()
    }
  }, [step, tour.steps.length, finish])

  const back = useCallback(() => setStep(s => Math.max(0, s - 1)), [])

  if (!tour) return null

  const current = tour.steps[step]
  const progress = ((step + 1) / tour.steps.length) * 100

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={start}
        className={`inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors ${className}`}
      >
        <span>▶</span>
        {done ? 'Revisit tour' : 'Start tour'}
      </button>

      {/* Floating tour panel */}
      {active && (
        <div className="fixed bottom-6 right-6 z-50 w-80 animate-in fade-in slide-in-from-bottom-4 duration-200">
          {/* Progress bar */}
          <div className="h-1 rounded-t-2xl overflow-hidden bg-blue-100">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="rounded-b-2xl border border-blue-200 bg-white shadow-2xl shadow-blue-100/40 p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{current.icon}</span>
                <div>
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest">
                    {tour.title} · {step + 1}/{tour.steps.length}
                  </p>
                  <p className="text-sm font-bold text-slate-900 leading-snug">{current.title}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={finish}
                className="text-slate-300 hover:text-slate-500 transition-colors ml-2 flex-shrink-0"
                aria-label="Close tour"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <p className="text-sm text-slate-600 leading-relaxed mb-3">{current.body}</p>

            {/* Hint */}
            {current.hint && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
                <span className="text-amber-500 text-xs mt-0.5 flex-shrink-0">💡</span>
                <p className="text-xs text-amber-800">{current.hint}</p>
              </div>
            )}

            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {tour.steps.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`rounded-full transition-all ${
                    i === step
                      ? 'w-4 h-2 bg-blue-500'
                      : i < step
                      ? 'w-2 h-2 bg-blue-300'
                      : 'w-2 h-2 bg-slate-200'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Navigation */}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={back}
                  className="flex-1 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  ← Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                className="flex-1 rounded-xl bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                {step < tour.steps.length - 1 ? 'Next →' : 'Finish ✓'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
