/**
 * EmptyState — Friendly Empty States
 * ====================================
 *
 * Replaces blank lists and tables with contextual, actionable messages.
 * Every empty state tells the user what they're looking at and what to do.
 *
 * Usage:
 *   <EmptyState
 *     icon={<HardDrive />}
 *     title="No memory stakes yet"
 *     description="Stake idle VRAM to earn passive yield. You set the price."
 *     action={{ label: 'Stake Memory', href: '/memory' }}
 *   />
 *
 * Variants:
 *   - default:   neutral, uses muted foreground
 *   - info:      blue tint (for "nothing here yet — that's fine")
 *   - warning:   amber tint (for states that need attention)
 */

import { ReactNode } from 'react'
import Link from 'next/link'

interface EmptyStateAction {
  label:  string
  href?:  string
  onClick?: () => void
}

interface EmptyStateProps {
  icon?:        ReactNode
  title:        string
  description?: string
  action?:      EmptyStateAction
  secondaryAction?: EmptyStateAction
  variant?:     'default' | 'info' | 'warning'
  size?:        'sm' | 'md' | 'lg'
  className?:   string
}

const VARIANT_CLASSES = {
  default: {
    bg:          'bg-slate-50',
    iconWrapper: 'bg-slate-100 text-slate-400',
    title:       'text-slate-700',
    desc:        'text-slate-500',
  },
  info: {
    bg:          'bg-blue-50',
    iconWrapper: 'bg-blue-100 text-blue-500',
    title:       'text-blue-900',
    desc:        'text-blue-700',
  },
  warning: {
    bg:          'bg-amber-50',
    iconWrapper: 'bg-amber-100 text-amber-600',
    title:       'text-amber-900',
    desc:        'text-amber-700',
  },
}

const SIZE_CLASSES = {
  sm: { padding: 'py-8 px-6', icon: 'w-8 h-8',  title: 'text-base', desc: 'text-sm'  },
  md: { padding: 'py-12 px-8', icon: 'w-10 h-10', title: 'text-lg',  desc: 'text-sm'  },
  lg: { padding: 'py-16 px-8', icon: 'w-12 h-12', title: 'text-xl',  desc: 'text-base' },
}

function ActionButton({ action, primary }: { action: EmptyStateAction; primary: boolean }) {
  const base = 'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors'
  const cls  = primary
    ? `${base} bg-slate-900 text-white hover:bg-slate-700`
    : `${base} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`

  if (action.href) {
    return (
      <Link href={action.href} className={cls}>
        {action.label}
        {primary && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        )}
      </Link>
    )
  }

  return (
    <button type="button" onClick={action.onClick} className={cls}>
      {action.label}
    </button>
  )
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'default',
  size = 'md',
  className = '',
}: EmptyStateProps) {
  const v = VARIANT_CLASSES[variant]
  const s = SIZE_CLASSES[size]

  return (
    <div className={`rounded-xl border border-slate-200 ${v.bg} ${s.padding} flex flex-col items-center text-center ${className}`}>
      {icon && (
        <div className={`${s.icon} rounded-xl ${v.iconWrapper} flex items-center justify-center mb-4 p-2`}>
          {icon}
        </div>
      )}
      <p className={`font-semibold ${v.title} ${s.title} mb-1`}>{title}</p>
      {description && (
        <p className={`${v.desc} ${s.desc} max-w-sm leading-relaxed mb-5`}>{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && <ActionButton action={action} primary={true} />}
          {secondaryAction && <ActionButton action={secondaryAction} primary={false} />}
        </div>
      )}
    </div>
  )
}

// ─── Pre-built empty states for common GP4U scenarios ────────────────────────

export function NoJobsEmpty() {
  return (
    <EmptyState
      icon={<JobIcon />}
      title="No jobs yet"
      description="Submit your first compute job. The Workload Advisor can recommend the right GPU based on your requirements."
      action={{ label: 'Create a Job', href: '/jobs' }}
      secondaryAction={{ label: 'Get GPU Recommendation', href: '/dashboard#advisor' }}
    />
  )
}

export function NoStakesEmpty() {
  return (
    <EmptyState
      icon={<MemoryIcon />}
      title="No memory stakes"
      description="Stake idle VRAM or RAM and earn a per-GB-per-second yield. You set your own asking price."
      action={{ label: 'Stake Memory', href: '/memory' }}
    />
  )
}

export function NoClustersEmpty() {
  return (
    <EmptyState
      icon={<ClusterIcon />}
      title="No clusters reserved"
      description="Reserve multiple GPUs together for distributed training. Allocation is atomic — you get all GPUs or none."
      action={{ label: 'Reserve Cluster', href: '/clusters' }}
    />
  )
}

export function NoLedgerEntriesEmpty() {
  return (
    <EmptyState
      icon={<LedgerIcon />}
      title="No ledger entries match this filter"
      description="The Obsidian ledger records every event on the platform. Try removing the event type filter to see all entries."
      variant="info"
      size="sm"
    />
  )
}

export function NoArbitrageResultsEmpty() {
  return (
    <EmptyState
      icon={<ArbitrageIcon />}
      title="Run a calculation to see results"
      description="Configure your GPU type, count, and duration above. We'll compare live prices across every provider."
      variant="info"
    />
  )
}

// ─── Simple icons for empty states ───────────────────────────────────────────

function JobIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="7" width="20" height="14" rx="2"/>
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <path d="M12 12v4M10 14h4"/>
    </svg>
  )
}

function MemoryIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="4" width="20" height="16" rx="2"/>
      <path d="M6 8v8M10 8v8M14 8v8M18 8v8"/>
      <path d="M2 12h20"/>
    </svg>
  )
}

function ClusterIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="2" y="2" width="9" height="9" rx="1"/>
      <rect x="13" y="2" width="9" height="9" rx="1"/>
      <rect x="2" y="13" width="9" height="9" rx="1"/>
      <rect x="13" y="13" width="9" height="9" rx="1"/>
    </svg>
  )
}

function LedgerIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      <path d="M8 7h8M8 11h8M8 15h4"/>
    </svg>
  )
}

function ArbitrageIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M7 17L17 7"/>
      <path d="M17 7H8M17 7v9"/>
      <circle cx="5" cy="19" r="2"/>
      <circle cx="19" cy="5" r="2"/>
    </svg>
  )
}
