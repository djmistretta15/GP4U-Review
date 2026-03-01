'use client'

/**
 * InfoTooltip — The ℹ️ Jargon Explainer
 * ========================================
 *
 * Every piece of technical jargon on GP4U has a definition.
 * Drop this next to any term and users get instant context
 * without ever leaving the page.
 *
 * Usage:
 *   <span>VRAM <Info term="VRAM" /></span>
 *   <span>Obsidian Ledger <Info term="ObsidianLedger" /></span>
 *   <Info term="Slash" inline />
 *
 * The popover opens on hover (desktop) or tap (mobile).
 * Keyboard: Tab to focus, Enter/Space to open, Escape to close.
 * Focus trap: clicking outside closes the popover.
 */

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from 'react'
import Link from 'next/link'
import { GLOSSARY, GlossaryEntry } from './glossary'

interface InfoTooltipProps {
  /** Key in the GLOSSARY dictionary */
  term: string
  /** Override display — shows a custom label instead of the ℹ️ icon */
  label?: string
  /** Render the term text inline before the ℹ️ icon */
  inline?: boolean
  /** Force popover to open on a specific side */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Optional className for the trigger element */
  className?: string
}

export function InfoTooltip({ term, label, inline = false, side = 'top', className = '' }: InfoTooltipProps) {
  const [open, setOpen]   = useState(false)
  const triggerRef        = useRef<HTMLButtonElement>(null)
  const popoverRef        = useRef<HTMLDivElement>(null)

  const entry: GlossaryEntry | undefined = GLOSSARY[term]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus() }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) }
  }

  if (!entry) {
    // Unknown term — render nothing (don't break layout)
    return null
  }

  const positionClasses = {
    top:    'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left:   'right-full top-1/2 -translate-y-1/2 mr-2',
    right:  'left-full top-1/2 -translate-y-1/2 ml-2',
  }[side]

  const arrowClasses = {
    top:    'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-slate-800',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-slate-800',
    left:   'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-slate-800',
    right:  'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-slate-800',
  }[side]

  return (
    <span className={`relative inline-flex items-center gap-1 ${className}`}>
      {inline && (
        <span className="font-medium">{entry.term}</span>
      )}
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Definition: ${entry.term}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
        onKeyDown={handleKeyDown}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-help"
        style={{ fontSize: '10px', fontStyle: 'normal', fontWeight: 600 }}
      >
        {label ?? 'i'}
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Definition of ${entry.term}`}
          className={`absolute z-50 w-72 ${positionClasses}`}
        >
          {/* Arrow */}
          <div className={`absolute w-0 h-0 border-4 ${arrowClasses}`} />

          {/* Popover card */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-xl shadow-black/10 overflow-hidden">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2 border-b border-slate-100 bg-slate-50">
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {entry.category}
                </p>
                <p className="text-sm font-bold text-slate-900 leading-tight">{entry.term}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex-shrink-0 text-slate-400 hover:text-slate-600 mt-0.5"
                aria-label="Close definition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>

            {/* Definition */}
            <div className="px-4 py-3">
              <p className="text-sm text-slate-700 leading-relaxed">{entry.definition}</p>
            </div>

            {/* Footer */}
            {entry.docPath && (
              <div className="px-4 pb-3">
                <Link
                  href={entry.docPath}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
                >
                  Learn more
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  )
}

/**
 * Shorthand for inline term + ℹ️ together:
 *   <Term id="VRAM" /> → renders "VRAM ℹ️" with popover
 */
export function Term({ id, className }: { id: string; className?: string }) {
  const entry = GLOSSARY[id]
  if (!entry) return <span className={className}>{id}</span>
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span className="font-medium">{entry.term}</span>
      <InfoTooltip term={id} />
    </span>
  )
}
