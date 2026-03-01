'use client'

/**
 * /billing — Credit Balance & Transaction History
 * =================================================
 *
 * The single source of truth for a user's money on GP4U.
 *
 * Design principles:
 *   1. Balance visible in 1 second — no accordion, no hidden menu
 *   2. Every transaction traceable to an Obsidian ledger block
 *   3. "Add credits" never more than 2 clicks away
 *   4. No surprises — fee schedule shown before any purchase
 *   5. Refund policy visible inline (not buried in ToS)
 *
 * Data:
 *   balance = sum(CREDITS_ADDED) − sum(Job actual_cost)
 *   Derived from the Obsidian ledger — no separate "balance" field.
 */

import { useState, useEffect, useCallback } from 'react'
import { PageHeader }  from '@/components/ui/page-header'
import { Term }        from '@/components/ui/info-tooltip'
import { StatusBadge } from '@/components/ui/status-badge'

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

// ── Credit presets (mirror onboarding) ────────────────────────────────────────

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
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  return `${days}d ago`
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [data,       setData]      = useState<BillingData | null>(null)
  const [loading,    setLoading]   = useState(true)
  const [error,      setError]     = useState<string | null>(null)

  // Add-credits panel state
  const [selectedAmt, setSelectedAmt] = useState<number | null>(null)
  const [customAmt,   setCustomAmt]   = useState('')
  const [adding,      setAdding]      = useState(false)
  const [addSuccess,  setAddSuccess]  = useState<string | null>(null)
  const [addError,    setAddError]    = useState<string | null>(null)
  const [showFees,    setShowFees]    = useState(false)

  const finalAmount = selectedAmt ?? (parseFloat(customAmt) >= 10 ? parseFloat(customAmt) : null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/billing/credits')
      if (!res.ok) throw new Error(await res.text())
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load billing data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleAddCredits = async () => {
    if (!finalAmount) return
    setAdding(true)
    setAddError(null)
    setAddSuccess(null)
    try {
      const res = await fetch('/api/billing/credits', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ amount: finalAmount }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to add credits')
      setAddSuccess(json.message)
      setSelectedAmt(null)
      setCustomAmt('')
      await loadData()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Failed to add credits')
    } finally {
      setAdding(false)
    }
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

          {/* ── Left column: balance + transactions ──────────────────────── */}
          <div className="lg:col-span-2 space-y-6">

            {/* Balance card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">
                    Available Balance <Term id="ComputeCredits" />
                  </p>
                  <p className="text-4xl font-black text-slate-900 tabular-nums">
                    ${fmt(data.balance)}
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    USD-pegged 1:1 · derived from{' '}
                    <Term id="ObsidianLedger" />
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={data.balance > 0 ? 'ACTIVE' : 'OFFLINE'} size="sm" />
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div>
                  <p className="text-xs text-slate-500">Total added</p>
                  <p className="text-lg font-bold text-green-700">${fmt(data.total_credits_added)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Total spent on jobs</p>
                  <p className="text-lg font-bold text-slate-700">${fmt(data.total_spent)}</p>
                </div>
              </div>
            </div>

            {/* Transaction history */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-800">Transaction History</h2>
                <span className="text-xs text-slate-400">All activity · Obsidian verified</span>
              </div>

              {data.transactions.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm font-medium text-slate-700">No transactions yet</p>
                  <p className="text-xs text-slate-400 mt-1">Add credits or run a job to see activity here.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.transactions.map(tx => (
                    <div key={tx.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                          tx.type === 'credit'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          {tx.type === 'credit' ? '↑' : '↓'}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{tx.label}</p>
                          <p className="text-xs text-slate-400">{relativeTime(tx.timestamp)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold tabular-nums ${
                          tx.type === 'credit' ? 'text-green-600' : 'text-slate-700'
                        }`}>
                          {tx.type === 'credit' ? '+' : '−'}${fmt(Math.abs(tx.amount))}
                        </p>
                        <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                          {tx.type === 'credit' ? 'Credit' : 'Job cost'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* ── Right column: add credits ────────────────────────────────── */}
          <div className="space-y-4">

            {/* Add credits panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800 mb-4">Add Compute Credits</h2>

              {addSuccess && (
                <div className="mb-4 rounded-xl border border-green-200 bg-green-50 p-3 text-xs text-green-800">
                  ✓ {addSuccess}
                </div>
              )}
              {addError && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  {addError}
                </div>
              )}

              {/* Preset amounts */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                {PRESETS.map(p => (
                  <button
                    key={p.amount}
                    type="button"
                    onClick={() => { setSelectedAmt(p.amount); setCustomAmt('') }}
                    className={`relative rounded-xl border-2 px-3 py-3 text-left text-xs transition-all ${
                      selectedAmt === p.amount
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
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

              {/* Custom amount */}
              <div className="relative mb-4">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                <input
                  type="number"
                  value={customAmt}
                  onChange={e => { setCustomAmt(e.target.value); setSelectedAmt(null) }}
                  placeholder="Custom amount (min $10)"
                  min="10"
                  max="10000"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-400 focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={handleAddCredits}
                disabled={!finalAmount || adding}
                className="w-full rounded-xl bg-blue-600 text-white py-2.5 text-sm font-semibold hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {adding ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Processing…
                  </>
                ) : (
                  finalAmount ? `Add $${fmt(finalAmount)} →` : 'Select an amount'
                )}
              </button>

              {/* Fee transparency */}
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
                    ['Platform fee', '5% of credit value — listed on invoices'],
                    ['Payment processing', 'Stripe: 2.9% + $0.30'],
                    ['Unused credits', 'Refundable within 90 days, no questions'],
                    ['Failed jobs', 'Credits returned instantly (provider fault)'],
                    ['Credits held in escrow', 'Released to provider after job success'],
                  ].map(([title, desc]) => (
                    <div key={title} className="flex items-start gap-2">
                      <span className="text-green-500 text-xs mt-0.5 flex-shrink-0">✓</span>
                      <div>
                        <span className="text-[11px] font-medium text-slate-700">{title}: </span>
                        <span className="text-[11px] text-slate-500">{desc}</span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-200 mt-2">
                    GP4U never stores card details. Payment via Stripe.
                  </p>
                </div>
              )}
            </div>

            {/* Obsidian trust block */}
            <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
              <p className="text-xs font-semibold text-green-800 mb-1.5 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
                Obsidian Ledger Active
              </p>
              <p className="text-[11px] text-green-700 leading-relaxed">
                Every credit addition and job cost is sealed in the{' '}
                <Term id="ObsidianLedger" /> — an append-only,
                hash-chained record. Your balance is always independently
                verifiable. No one, including GP4U, can alter past entries.
              </p>
            </div>

            {/* Refund card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold text-slate-700 mb-1">90-Day Refund Policy</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
                Unused credits are fully refundable within 90 days of purchase.
                No questions asked. Request via Settings → Billing → Refund.
              </p>
              <p className="text-[10px] text-slate-400">
                Credits used for completed jobs are non-refundable.
                Credits held in escrow for running jobs are released back on failure.
              </p>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
