/**
 * StatusBadge — Unified Status Visual Language
 * =============================================
 *
 * Every status in GP4U uses the same visual language: a colored dot,
 * a consistent label, and the same opacity rules for non-terminal states.
 *
 * Covers all status enums:
 *   - JobStatus:      PENDING, RUNNING, COMPLETE, FAILED
 *   - NodeStatus:     PENDING_VERIFICATION, ACTIVE, SUSPENDED, EJECTED
 *   - ChamberMode:    OFFLINE, PASSIVE, BACKTEST, ACTIVE
 *   - AppealStatus:   PENDING, UNDER_REVIEW, ACCEPTED, REJECTED, EXPIRED
 *   - StakeStatus:    ACTIVE, PARTIALLY_SLASHED, FULLY_SLASHED, RELEASED, LOCKED_APPEAL
 *   - ProofStatus:    PENDING_VERIFICATION, VERIFIED, INVALID, EXPIRED
 *   - SlashSeverity:  WARNING, SOFT_SLASH, HARD_SLASH
 *   - GPUStatus:      AVAILABLE, BUSY, LIMITED, OFFLINE
 *
 * Usage:
 *   <StatusBadge status="RUNNING" />
 *   <StatusBadge status="ACTIVE" type="chamber" />
 *   <StatusBadge status="HARD_SLASH" size="sm" />
 */

interface StatusConfig {
  dot:    string   // Tailwind bg class for dot
  text:   string   // Tailwind text class
  bg:     string   // Tailwind bg class for badge background
  border: string   // Tailwind border class
  label:  string   // Human-readable label
  pulse?: boolean  // Animate dot for live/active states
}

const STATUS_MAP: Record<string, StatusConfig> = {

  // ── Job Status ────────────────────────────────────────────────────────────
  PENDING: {
    dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', label: 'Pending',
  },
  RUNNING: {
    dot: 'bg-blue-500', text: 'text-blue-800', bg: 'bg-blue-50',
    border: 'border-blue-200', label: 'Running', pulse: true,
  },
  COMPLETE: {
    dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50',
    border: 'border-green-200', label: 'Complete',
  },
  FAILED: {
    dot: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50',
    border: 'border-red-200', label: 'Failed',
  },

  // ── Node Status ───────────────────────────────────────────────────────────
  PENDING_VERIFICATION: {
    dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', label: 'Pending Verification',
  },
  SUSPENDED: {
    dot: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-50',
    border: 'border-orange-200', label: 'Suspended',
  },
  EJECTED: {
    dot: 'bg-red-600', text: 'text-red-900', bg: 'bg-red-50',
    border: 'border-red-300', label: 'Ejected',
  },

  // ── Chamber Mode ──────────────────────────────────────────────────────────
  OFFLINE: {
    dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50',
    border: 'border-slate-200', label: 'Offline',
  },
  PASSIVE: {
    dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', label: 'Passive',
  },
  BACKTEST: {
    dot: 'bg-purple-500', text: 'text-purple-800', bg: 'bg-purple-50',
    border: 'border-purple-200', label: 'Backtesting', pulse: true,
  },
  ACTIVE: {
    dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50',
    border: 'border-green-200', label: 'Active', pulse: true,
  },

  // ── Appeal Status ─────────────────────────────────────────────────────────
  UNDER_REVIEW: {
    dot: 'bg-blue-400', text: 'text-blue-800', bg: 'bg-blue-50',
    border: 'border-blue-200', label: 'Under Review', pulse: true,
  },
  ACCEPTED: {
    dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50',
    border: 'border-green-200', label: 'Accepted',
  },
  REJECTED: {
    dot: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50',
    border: 'border-red-200', label: 'Rejected',
  },
  EXPIRED: {
    dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50',
    border: 'border-slate-200', label: 'Expired',
  },

  // ── Stake Status ──────────────────────────────────────────────────────────
  PARTIALLY_SLASHED: {
    dot: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-50',
    border: 'border-orange-200', label: 'Partially Slashed',
  },
  FULLY_SLASHED: {
    dot: 'bg-red-600', text: 'text-red-900', bg: 'bg-red-50',
    border: 'border-red-300', label: 'Fully Slashed',
  },
  RELEASED: {
    dot: 'bg-slate-400', text: 'text-slate-600', bg: 'bg-slate-50',
    border: 'border-slate-200', label: 'Released',
  },
  LOCKED_APPEAL: {
    dot: 'bg-purple-500', text: 'text-purple-800', bg: 'bg-purple-50',
    border: 'border-purple-200', label: 'Locked (Appeal)',
  },

  // ── Proof Status ──────────────────────────────────────────────────────────
  VERIFIED: {
    dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50',
    border: 'border-green-200', label: 'Verified',
  },
  INVALID: {
    dot: 'bg-red-500', text: 'text-red-800', bg: 'bg-red-50',
    border: 'border-red-200', label: 'Invalid',
  },

  // ── Slash Severity ────────────────────────────────────────────────────────
  WARNING: {
    dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', label: 'Warning',
  },
  SOFT_SLASH: {
    dot: 'bg-orange-500', text: 'text-orange-800', bg: 'bg-orange-50',
    border: 'border-orange-200', label: 'Soft Slash',
  },
  HARD_SLASH: {
    dot: 'bg-red-600', text: 'text-red-900', bg: 'bg-red-50',
    border: 'border-red-300', label: 'Hard Slash',
  },

  // ── GPU Status ────────────────────────────────────────────────────────────
  AVAILABLE: {
    dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50',
    border: 'border-green-200', label: 'Available',
  },
  BUSY: {
    dot: 'bg-blue-500', text: 'text-blue-800', bg: 'bg-blue-50',
    border: 'border-blue-200', label: 'Busy', pulse: true,
  },
  LIMITED: {
    dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50',
    border: 'border-amber-200', label: 'Limited',
  },

  // ── Provider Tier ─────────────────────────────────────────────────────────
  UNIVERSITY: {
    dot: 'bg-indigo-500', text: 'text-indigo-800', bg: 'bg-indigo-50',
    border: 'border-indigo-200', label: 'University',
  },
  COMMERCIAL: {
    dot: 'bg-cyan-500', text: 'text-cyan-800', bg: 'bg-cyan-50',
    border: 'border-cyan-200', label: 'Commercial',
  },

  // ── Veritas Tiers ─────────────────────────────────────────────────────────
  GOLD: {
    dot: 'bg-yellow-500', text: 'text-yellow-800', bg: 'bg-yellow-50',
    border: 'border-yellow-300', label: 'Gold',
  },
  SILVER: {
    dot: 'bg-slate-400', text: 'text-slate-700', bg: 'bg-slate-50',
    border: 'border-slate-300', label: 'Silver',
  },
  BRONZE: {
    dot: 'bg-orange-400', text: 'text-orange-800', bg: 'bg-orange-50',
    border: 'border-orange-200', label: 'Bronze',
  },
  UNRATED: {
    dot: 'bg-slate-300', text: 'text-slate-500', bg: 'bg-slate-50',
    border: 'border-slate-200', label: 'Unrated',
  },
}

const FALLBACK: StatusConfig = {
  dot: 'bg-slate-300', text: 'text-slate-600', bg: 'bg-slate-50',
  border: 'border-slate-200', label: '—',
}

type BadgeSize = 'xs' | 'sm' | 'md'

interface StatusBadgeProps {
  status:     string
  size?:      BadgeSize
  showDot?:   boolean
  className?: string
  /** Override the label text */
  label?:     string
}

const SIZE_CLASSES: Record<BadgeSize, { badge: string; dot: string }> = {
  xs: { badge: 'text-[10px] px-1.5 py-0.5 gap-1',   dot: 'w-1.5 h-1.5' },
  sm: { badge: 'text-xs px-2 py-0.5 gap-1.5',        dot: 'w-2 h-2' },
  md: { badge: 'text-sm px-2.5 py-1 gap-2',          dot: 'w-2 h-2' },
}

export function StatusBadge({
  status,
  size = 'sm',
  showDot = true,
  className = '',
  label,
}: StatusBadgeProps) {
  const cfg = STATUS_MAP[status] ?? FALLBACK
  const s   = SIZE_CLASSES[size]

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${cfg.bg} ${cfg.border} ${cfg.text} ${s.badge} ${className}`}
    >
      {showDot && (
        <span className={`rounded-full flex-shrink-0 ${cfg.dot} ${s.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
      )}
      {label ?? cfg.label}
    </span>
  )
}

/**
 * Compact dot-only indicator (no text label).
 * Use when space is tight and the status is clear from context.
 */
export function StatusDot({ status, size = 'sm' }: { status: string; size?: BadgeSize }) {
  const cfg = STATUS_MAP[status] ?? FALLBACK
  const s   = SIZE_CLASSES[size]
  return (
    <span
      className={`rounded-full inline-block flex-shrink-0 ${cfg.dot} ${s.dot} ${cfg.pulse ? 'animate-pulse' : ''}`}
      title={cfg.label}
    />
  )
}
