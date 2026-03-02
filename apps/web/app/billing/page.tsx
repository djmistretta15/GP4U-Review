'use client'

/**
 * /billing — Credit Balance, Transaction History & Payment
 * ==========================================================
 *
 * Payment flow (Stripe):
 *   1. User selects amount → "Continue" button
 *   2. Frontend calls POST /api/billing/checkout → gets client_secret
 *   3. Stripe Payment Element renders inside the panel
 *   4. User confirms → stripe.confirmPayment() → redirects to /billing?payment=success
 *   5. Stripe webhook → /api/billing/webhook credits account asynchronously
 */

import { useState, useEffect, useCallback } from 'react'
import { PageHeader }  from '@/components/ui/page-header'
import { Term }        from '@/components/ui/info-tooltip'
import { StatusBadge } from '@/components/ui/status-badge'
import { apiFetch }    from '@/lib/api-client'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Transaction {
  id:        string
  type:      'credit' | 'spend'
  label:     string
  amount:    number
  timestamp: string
}

interface BillingData {
  balance:             number
  total_credits_added: number
  total_spent:         number
  transactions:        Transaction[]
}

// ── Credit presets ─────────────────────────────────────────────────────────────

const PRESETS = [
  { amount: 25,  label: '$25',  note: '~8h A100 80GB'  },
  { amount: 50,  label: '$50',  note: '~16h A100 80GB', popular: true },
  { amount: 100, label: '$100', note: '~32h A100 80GB' },
  { amount: 250, label: '$250', note: '~80h A100 80GB' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  return `${days}d ago`
}

// ── Stripe lazy loader ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _stripePromise: Promise<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getStripeJs(): Promise<any> {
  if (!_stripePromise) {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    if (!pk) return Promise.resolve(null)
    _stripePromise = import('@stripe/stripe-js').then(m => m.loadStripe(pk))
  }
  return _stripePromise
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data,    setData]    = useState<BillingData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  // Amount selection
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null)
  const [customAmt,   setCustomAmt]   = useState('')
  const [showFees,    setShowFees]    = useState(false)

  // Checkout flow
  type Step = 'select' | 'payment' | 'processing'
  const [step,         setStep]         = useState<Step>('select')
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stripeRef,    setStripeRef]    = useState<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [elementsRef,  setElementsRef]  = useState<any>(null)
  const [paymentErr,   setPaymentErr]   = useState<string | null>(null)
  const [justPaid,     setJustPaid]     = useState(false)

  const finalAmount = selectedAmt ?? (parseFloat(customAmt) >= 10 ? parseFloat(customAmt) : null)

  // Check for post-Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      setJustPaid(true)
      window.history.replaceState({}, '', '/billing')
    }
  }, [])

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await apiFetch('/api/billing/credits')
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Step 1: Create PaymentIntent, mount Stripe Elements ─────────────────────

  const handleContinue = async () => {
    if (!finalAmount) return
    setPaymentErr(null)
    setStep('processing')

    try {
      const res  = await apiFetch('/api/billing/checkout', {
        method: 'POST',
        body:   JSON.stringify({ amount_usd: finalAmount }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Checkout failed')

      const stripe = await getStripeJs()
      if (!stripe) throw new Error('Stripe is not configured (missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)')

      const elements = stripe.elements({
        clientSecret: json.client_secret,
        appearance: {
          theme: 'flat',
          variables: {
            colorPrimary: '#3b82f6',
            colorText:    '#1e293b',
            fontFamily:   'Inter, system-ui, sans-serif',
            borderRadius: '10px',
          },
        },
      })

      // Mount Payment Element into DOM after React renders the container
      setClientSecret(json.client_secret)
      setStripeRef(stripe)
      setElementsRef(elements)
      setStep('payment')

      // Mount after next tick so the container div is in the DOM
      setTimeout(() => {
        const el = elements.create('payment')
        el.mount('#stripe-payment-element')
      }, 0)
    } catch (e) {
      setPaymentErr(e instanceof Error ? e.message : 'Failed to start checkout')
      setStep('select')
    }
  }

  // ── Step 2: Confirm payment ─────────────────────────────────────────────────

  const handleConfirm = async () => {
    if (!stripeRef || !elementsRef) return
    setPaymentErr(null)
    setStep('processing')

    const { error } = await stripeRef.confirmPayment({
      elements:      elementsRef,
      confirmParams: {
        return_url: `${window.location.origin}/billing?payment=success`,
      },
    })

    if (error) {
      setPaymentErr(error.message ?? 'Payment failed')
      setStep('payment')
    }
    // On success, Stripe redirects — we never reach here
  }

  const resetCheckout = () => {
    setStep('select')
    setClientSecret(null)
    setStripeRef(null)
    setElementsRef(null)
    setPaymentErr(null)
    setSelectedAmt(null)
    setCustomAmt('')
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Credit balance, transaction history, and payment settings."
        helpTopic="dashboard"
        breadcrumbs={[{ label: 'Billing' }]}
      />

      {justPaid && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 flex items-start gap-3">
          <span className="text-green-500 text-lg mt-0.5">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-800">Payment received!</p>
            <p className="text-xs text-green-700 mt-0.5">
              Credits are being added to your account (10–30 seconds). Refresh if your balance hasn't updated.
            </p>
          </div>
          <button onClick={loadData} className="ml-auto text-xs text-green-600 underline flex-shrink-0">Refresh</button>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-3 text-sm text-slate-500 py-8">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Loading billing data…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error} — <button onClick={loadData} className="underline">retry</button>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left: balance + history ──────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">
                    Available Balance <Term id="ComputeCredits" />
                  </p>
                  <p className="text-4xl font-black text-slate-900 tabular-nums">${fmt(data.balance)}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    USD-pegged 1:1 · derived from <Term id="ObsidianLedger" />
                  </p>
                </div>
                <StatusBadge status={data.balance > 0 ? 'ACTIVE' : 'OFFLINE'} size="sm" />
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Total added</p>
                  <p className="text-lg font-bold text-green-700">${fmt(data.total_credits_added)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total spent</p>
                  <p className="text-lg font-bold text-slate-700">${fmt(data.total_spent)}</p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Transaction History</h2>
                <span className="text-xs text-slate-400">Obsidian verified</span>
              </div>
              {data.transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm font-medium text-slate-700">No transactions yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add credits to get started.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                          tx.type === 'credit' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {tx.type === 'credit' ? '↑' : '↓'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{tx.label}</p>
                          <p className="text-xs text-slate-400">{relativeTime(tx.timestamp)}</p>
                        </div>
                      </div>
                      <p className={`text-sm font-semibold tabular-nums ${tx.type === 'credit' ? 'text-green-600' : 'text-slate-700'}`}>
                        {tx.type === 'credit' ? '+' : '−'}${fmt(Math.abs(tx.amount))}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Right: checkout panel ────────────────────────────────────── */}
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Add Compute Credits</h2>

              {paymentErr && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {paymentErr}
                </div>
              )}

              {/* Amount selection */}
              {step === 'select' && (
                <>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {PRESETS.map(p => (
                      <button
                        key={p.amount}
                        type="button"
                        onClick={() => { setSelectedAmt(p.amount); setCustomAmt('') }}
                        className={`relative rounded-xl border-2 px-3 py-3 text-left text-xs transition-all ${
                          selectedAmt === p.amount ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {p.popular && (
                          <span className="absolute -top-2 left-2 text-[9px] font-bold bg-blue-500 text-white px-1.5 py-0.5 rounded-full">
                            Popular
                          </span>
                        )}
                        <p className="text-base font-bold text-slate-900">{p.label}</p>
                        <p className="text-slate-500 mt-0.5">{p.note}</p>
                      </button>
                    ))}
                  </div>
                  <div className="relative mb-4">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      value={customAmt}
                      onChange={e => { setCustomAmt(e.target.value); setSelectedAmt(null) }}
                      placeholder="Custom amount (min $10)"
                      min="10" max="10000"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:bg-white"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleContinue}
                    disabled={!finalAmount}
                    className="w-full rounded-xl bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {finalAmount ? `Continue with $${fmt(finalAmount)} →` : 'Select an amount'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowFees(f => !f)}
                    className="mt-3 text-xs text-slate-400 hover:text-slate-600 underline w-full text-center"
                  >
                    {showFees ? 'Hide' : 'See'} fee schedule & refund policy
                  </button>
                  {showFees && (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                      {[
                        ['Platform fee', '5% — listed on invoices'],
                        ['Payment processing', 'Stripe: 2.9% + $0.30'],
                        ['Unused credits', 'Refundable within 90 days'],
                        ['Failed jobs', 'Credits returned instantly'],
                      ].map(([t, d]) => (
                        <div key={t} className="flex items-start gap-2">
                          <span className="text-green-500 text-xs mt-0.5">✓</span>
                          <div>
                            <span className="text-[11px] font-medium text-slate-700">{t}: </span>
                            <span className="text-[11px] text-slate-500">{d}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* Stripe Payment Element */}
              {step === 'payment' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">Paying ${fmt(finalAmount ?? 0)}</p>
                    <button type="button" onClick={resetCheckout} className="text-xs text-slate-400 hover:text-slate-600 underline">
                      Change amount
                    </button>
                  </div>
                  {/* Stripe mounts the Payment Element here */}
                  <div id="stripe-payment-element" className="min-h-[140px] rounded-xl" />
                  <button
                    type="button"
                    onClick={handleConfirm}
                    className="w-full rounded-xl bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-500 transition-colors"
                  >
                    Pay ${fmt(finalAmount ?? 0)}
                  </button>
                  <p className="text-[10px] text-slate-400 text-center">
                    Secured by Stripe · GP4U never stores card details
                  </p>
                </div>
              )}

              {/* Processing spinner */}
              {step === 'processing' && (
                <div className="flex items-center justify-center gap-3 py-8 text-sm text-slate-500">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  {clientSecret ? 'Confirming payment…' : 'Preparing secure checkout…'}
                </div>
              )}
            </div>

            {/* Trust block */}
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold text-green-800 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Obsidian Ledger Active
              </p>
              <p className="text-[11px] text-green-700 leading-relaxed">
                Every transaction is sealed in the <Term id="ObsidianLedger" /> — append-only and independently verifiable.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-700 mb-1">90-Day Refund Policy</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Unused credits refunded within 90 days. No questions asked.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
