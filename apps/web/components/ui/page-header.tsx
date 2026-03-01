/**
 * PageHeader — Standard Page Header with Contextual Help
 * ========================================================
 *
 * Every page gets the same header structure:
 *   - Title + description (left)
 *   - Help button with ? circle (always top-right)
 *   - Optional action buttons slot (right of description)
 *   - Optional breadcrumbs below title
 *
 * The help button opens a slide-in drawer with page-specific guidance,
 * key terms defined, and links to relevant docs.
 *
 * Usage:
 *   <PageHeader
 *     title="Memory Staking"
 *     description="Stake idle VRAM and RAM for passive yield."
 *     helpTopic="memory"
 *     actions={<Button>New Stake</Button>}
 *     breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Memory' }]}
 *   />
 */

'use client'

import { useState, ReactNode } from 'react'
import Link from 'next/link'
import { InfoTooltip } from './info-tooltip'

// ─── Page-specific help content ───────────────────────────────────────────────

interface PageHelp {
  title:        string
  summary:      string
  keyTerms:     string[]   // Glossary keys to display
  learnMore:    Array<{ label: string; href: string }>
}

const PAGE_HELP: Record<string, PageHelp> = {
  dashboard: {
    title:    'Dashboard',
    summary:  'Your command center. See live job stats, the best GPU deal available right now, your compute spend, and how much GP4U has saved you through arbitrage routing.',
    keyTerms: ['Arbitrage', 'Chamber', 'ObsidianLedger'],
    learnMore: [
      { label: 'How jobs work',       href: '/docs/pipeline' },
      { label: 'Understanding costs', href: '/docs/pipeline#billing' },
    ],
  },
  arbitrage: {
    title:    'Cross-Cloud Arbitrage',
    summary:  'Compare GPU prices across every major cloud provider in real time. Each comparison also trains the Mist and Aetherion chambers, making routing smarter for everyone.',
    keyTerms: ['Arbitrage', 'Mist', 'Aetherion'],
    learnMore: [
      { label: 'Arbitrage guide', href: '/docs/pipeline#arbitrage' },
      { label: 'Chambers reference', href: '/docs/chambers' },
    ],
  },
  memory: {
    title:    'Memory Staking',
    summary:  'Offer your idle VRAM and RAM to other jobs and earn a per-GB-per-second yield. Mnemo routes memory-hungry jobs toward staked capacity. You set your own price.',
    keyTerms: ['VRAM', 'Stake', 'Yield', 'Mnemo'],
    learnMore: [
      { label: 'Staking guide',       href: '/docs/staking-and-slashing' },
      { label: 'How Mnemo works',      href: '/docs/chambers#mnemo' },
    ],
  },
  clusters: {
    title:    'GPU Clusters',
    summary:  'Reserve multiple GPUs together for distributed training or inference. Cluster allocation is atomic — you either get all the GPUs you requested or none (TOCTOU-safe).',
    keyTerms: ['Cluster', 'VRAM', 'WorkloadType'],
    learnMore: [
      { label: 'Cluster reservation guide', href: '/docs/pipeline#clusters' },
    ],
  },
  admin: {
    title:    'Platform Admin',
    summary:  'Manage chambers, browse the Obsidian immutable ledger, and monitor platform health. Requires clearance level 3 (ADMIN). Every action you take here is recorded on the ledger.',
    keyTerms: ['Chamber', 'ChamberMode', 'ObsidianLedger', 'Backtest', 'ClearanceLevel'],
    learnMore: [
      { label: 'Chambers reference',   href: '/docs/chambers' },
      { label: 'Obsidian ledger',       href: '/docs/architecture#obsidian' },
    ],
  },
  providers: {
    title:    'Provider Onboarding',
    summary:  'Connect your GPU hardware to the GP4U network. University providers join with zero cash stake — your institution\'s reputation is the commitment. Commercial providers post a per-GPU cash stake.',
    keyTerms: ['Provider', 'ProviderTier', 'Stake', 'VisibilityConsent'],
    learnMore: [
      { label: 'Full provider guide', href: '/docs/provider-guide' },
    ],
  },
  zk: {
    title:    'ZK Attestation',
    summary:  'Zero-knowledge proofs let providers prove hardware specs, energy consumption, and uptime without revealing any private job data. You can verify every proof independently.',
    keyTerms: ['ZKProof', 'HardwareAttestation', 'EnergyAttestation', 'UptimeAttestation'],
    learnMore: [
      { label: 'ZK attestation guide', href: '/docs/zk-attestation' },
    ],
  },
}

// ─── Breadcrumbs ──────────────────────────────────────────────────────────────

interface Breadcrumb {
  label: string
  href?: string
}

function Breadcrumbs({ crumbs }: { crumbs: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
      <Link href="/dashboard" className="hover:text-slate-700 transition-colors">Home</Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span>/</span>
          {crumb.href && i < crumbs.length - 1 ? (
            <Link href={crumb.href} className="hover:text-slate-700 transition-colors">{crumb.label}</Link>
          ) : (
            <span className="text-slate-700 font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  )
}

// ─── Help Drawer ──────────────────────────────────────────────────────────────

function HelpDrawer({
  open,
  onClose,
  help,
}: {
  open:    boolean
  onClose: () => void
  help:    PageHelp
}) {
  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-white border-l border-slate-200 shadow-2xl flex flex-col overflow-hidden">

        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Page Guide</p>
            <p className="text-sm font-bold text-slate-900">{help.title}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
            aria-label="Close help panel"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Summary */}
          <div>
            <p className="text-sm text-slate-700 leading-relaxed">{help.summary}</p>
          </div>

          {/* Key terms */}
          {help.keyTerms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Key Terms</p>
              <div className="space-y-1">
                {help.keyTerms.map(key => (
                  <InfoTooltip
                    key={key}
                    term={key}
                    inline
                    className="flex w-full text-sm text-slate-700 hover:text-slate-900 py-1"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Learn more */}
          {help.learnMore.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Docs</p>
              <div className="space-y-1">
                {help.learnMore.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={onClose}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 py-1"
                  >
                    <span>{link.label}</span>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-400">
            Every action on this page is recorded on the Obsidian immutable ledger.
          </p>
        </div>

      </div>
    </>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface PageHeaderProps {
  title:        string
  description?: string
  helpTopic?:   string
  actions?:     ReactNode
  breadcrumbs?: Breadcrumb[]
  children?:    ReactNode
}

export function PageHeader({
  title,
  description,
  helpTopic,
  actions,
  breadcrumbs,
  children,
}: PageHeaderProps) {
  const [helpOpen, setHelpOpen] = useState(false)
  const help = helpTopic ? PAGE_HELP[helpTopic] : undefined

  return (
    <>
      <div className="mb-8">
        {/* Breadcrumbs */}
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs crumbs={breadcrumbs} />
        )}

        {/* Main header row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
            {description && (
              <p className="mt-1 text-base text-slate-500 leading-relaxed max-w-2xl">{description}</p>
            )}
          </div>

          {/* Right: actions + help button */}
          <div className="flex items-center gap-2 flex-shrink-0 pt-1">
            {actions}
            {help && (
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors text-sm font-semibold"
                aria-label={`Help: ${title}`}
                title={`Help for ${title} (explains key terms)`}
              >
                ?
              </button>
            )}
          </div>
        </div>

        {/* Optional extra content (e.g. tab navigation) */}
        {children && <div className="mt-4">{children}</div>}
      </div>

      {/* Help drawer */}
      {help && (
        <HelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} help={help} />
      )}
    </>
  )
}
