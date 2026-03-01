'use client'

/**
 * GlobalSearch — Always-Available Omnisearch
 * ==========================================
 *
 * Cmd+K (Mac) / Ctrl+K (Windows) opens the command palette from anywhere.
 * The search bar is also always visible in the app header.
 *
 * Searches:
 *   - Navigation pages (Dashboard, Arbitrage, Memory, Clusters, Admin)
 *   - GP4U Glossary (40+ terms with definitions)
 *   - Help articles (links to /docs)
 *   - Recent searches (localStorage)
 *
 * No backend required — all results are static client-side.
 * Keyboard navigation: ↑↓ to move, Enter to select, Escape to close.
 */

import { useState, useEffect, useRef, useCallback, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { searchGlossary } from './glossary'

// ─── Static search items ──────────────────────────────────────────────────────

interface SearchResult {
  id:          string
  label:       string
  description: string
  href:        string
  group:       'page' | 'glossary' | 'help' | 'recent'
  icon:        string
}

const PAGES: SearchResult[] = [
  { id: 'dashboard',  label: 'Dashboard',           description: 'Your jobs, stats, and best deals',        href: '/dashboard',  group: 'page', icon: '⊡' },
  { id: 'arbitrage',  label: 'Arbitrage Calculator', description: 'Compare GPU prices across providers',      href: '/arbitrage',  group: 'page', icon: '⬡' },
  { id: 'memory',     label: 'Memory Staking',        description: 'Stake idle VRAM/RAM for passive yield',   href: '/memory',     group: 'page', icon: '▣' },
  { id: 'clusters',   label: 'GPU Clusters',          description: 'Reserve multi-GPU clusters',              href: '/clusters',   group: 'page', icon: '⬢' },
  { id: 'admin',      label: 'Platform Admin',        description: 'Chambers, Obsidian ledger, diagnostics',  href: '/admin',      group: 'page', icon: '⚙' },
  { id: 'docs',       label: 'Documentation',         description: 'Full platform docs and guides',           href: '/docs',       group: 'page', icon: '📄' },
  { id: 'providers',  label: 'Become a Provider',     description: 'Connect your GPU hardware',               href: '/providers/register', group: 'page', icon: '🖥' },
]

const HELP_ARTICLES: SearchResult[] = [
  { id: 'h-pipeline',  label: 'How jobs work',          description: 'End-to-end job lifecycle guide',         href: '/docs/pipeline',              group: 'help', icon: '?' },
  { id: 'h-staking',   label: 'Staking & Slashing',     description: 'Provider stakes, slash conditions, appeals', href: '/docs/staking-and-slashing',  group: 'help', icon: '?' },
  { id: 'h-zk',        label: 'ZK Attestation',         description: 'Zero-knowledge hardware proofs',         href: '/docs/zk-attestation',        group: 'help', icon: '?' },
  { id: 'h-provider',  label: 'Provider Setup Guide',   description: 'Install the agent, join the network',    href: '/docs/provider-guide',        group: 'help', icon: '?' },
  { id: 'h-api',       label: 'API Reference',           description: 'All endpoints with request/response',    href: '/docs/api-reference',         group: 'help', icon: '?' },
]

const RECENT_KEY = 'gp4u_search_recent'
const MAX_RECENT  = 5

function loadRecent(): SearchResult[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as SearchResult[]) : []
  } catch { return [] }
}

function saveRecent(item: SearchResult) {
  try {
    const existing = loadRecent().filter(r => r.id !== item.id)
    localStorage.setItem(RECENT_KEY, JSON.stringify([item, ...existing].slice(0, MAX_RECENT)))
  } catch { /* localStorage not available */ }
}

const GROUP_LABELS: Record<string, string> = {
  recent:   'Recent',
  page:     'Pages',
  glossary: 'Glossary',
  help:     'Help & Docs',
}

// ─── Component ────────────────────────────────────────────────────────────────

interface GlobalSearchProps {
  /** If true, renders as a full-width header bar. If false, shows as a compact icon button. */
  variant?: 'bar' | 'icon'
}

export function GlobalSearch({ variant = 'bar' }: GlobalSearchProps) {
  const router                = useRouter()
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [cursor, setCursor]   = useState(0)
  const inputRef              = useRef<HTMLInputElement>(null)
  const listRef               = useRef<HTMLDivElement>(null)

  // ── Search logic ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!query.trim()) {
      const recent = loadRecent().map(r => ({ ...r, group: 'recent' as const }))
      setResults([...recent, ...PAGES.slice(0, 5)])
      setCursor(0)
      return
    }

    const q = query.toLowerCase()

    const matchPages = PAGES.filter(p =>
      p.label.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
    )

    const matchHelp = HELP_ARTICLES.filter(h =>
      h.label.toLowerCase().includes(q) || h.description.toLowerCase().includes(q)
    )

    const matchGlossary = searchGlossary(query).map(({ key, entry }) => ({
      id:          `glossary-${key}`,
      label:       entry.term,
      description: entry.definition.slice(0, 80) + '…',
      href:        entry.docPath ?? '#',
      group:       'glossary' as const,
      icon:        'i',
    }))

    setResults([...matchPages, ...matchHelp, ...matchGlossary].slice(0, 12))
    setCursor(0)
  }, [query])

  // ── Keyboard shortcut ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // ── Focus input when opened ──────────────────────────────────────────────────

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery('')
    }
  }, [open])

  // ── Navigate results ─────────────────────────────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setCursor(c => Math.min(c + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setCursor(c => Math.max(c - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (results[cursor]) navigate(results[cursor])
        break
      case 'Escape':
        setOpen(false)
        break
    }
  }

  const navigate = useCallback((result: SearchResult) => {
    saveRecent({ ...result, group: 'recent' })
    setOpen(false)
    router.push(result.href)
  }, [router])

  // ── Scroll active item into view ─────────────────────────────────────────────

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cursor="${cursor}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  // ── Render ───────────────────────────────────────────────────────────────────

  const grouped: Record<string, SearchResult[]> = {}
  for (const r of results) {
    if (!grouped[r.group]) grouped[r.group] = []
    grouped[r.group].push(r)
  }

  const trigger = variant === 'bar' ? (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center gap-2 w-full max-w-sm rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 px-3 py-2 text-sm text-slate-500 transition-all shadow-sm"
    >
      <SearchIcon />
      <span className="flex-1 text-left">Search pages, docs, glossary…</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400">
        <span>⌘</span>K
      </kbd>
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex items-center justify-center w-9 h-9 rounded-lg border border-slate-200 bg-slate-50 hover:bg-white text-slate-500 transition-colors"
      aria-label="Open search (⌘K)"
    >
      <SearchIcon />
    </button>
  )

  return (
    <>
      {trigger}

      {/* Modal overlay */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] px-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden">

            {/* Search input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
              <SearchIcon className="text-slate-400 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search pages, glossary, help…"
                className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent focus:outline-none"
                autoComplete="off"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="flex-shrink-0 text-slate-400 hover:text-slate-600"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              )}
              <kbd
                className="hidden sm:inline-flex flex-shrink-0 text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5"
                title="Press Escape to close"
              >
                esc
              </kbd>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
              {results.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-slate-500">No results for &ldquo;{query}&rdquo;</p>
                  <p className="text-xs text-slate-400 mt-1">Try searching for a page name or glossary term</p>
                </div>
              ) : (
                Object.entries(grouped).map(([group, items]) => (
                  <div key={group}>
                    <p className="px-4 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {GROUP_LABELS[group] ?? group}
                    </p>
                    {items.map((item, localIdx) => {
                      const globalIdx = results.indexOf(item)
                      return (
                        <button
                          key={item.id}
                          data-cursor={globalIdx}
                          type="button"
                          onClick={() => navigate(item)}
                          onMouseEnter={() => setCursor(globalIdx)}
                          className={`w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                            cursor === globalIdx ? 'bg-blue-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span className="flex-shrink-0 w-6 h-6 rounded-md bg-slate-100 flex items-center justify-center text-xs text-slate-500">
                            {item.icon}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 truncate">{item.label}</p>
                            <p className="text-xs text-slate-500 truncate">{item.description}</p>
                          </div>
                          {cursor === globalIdx && (
                            <span className="flex-shrink-0 text-xs text-slate-400 mt-0.5">↵</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer hint */}
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span><kbd className="font-medium">↑↓</kbd> navigate</span>
                <span><kbd className="font-medium">↵</kbd> open</span>
                <span><kbd className="font-medium">esc</kbd> close</span>
              </div>
              <span className="text-[10px] text-slate-400">GP4U Search</span>
            </div>

          </div>
        </div>
      )}
    </>
  )
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="11" cy="11" r="8"/>
      <path d="m21 21-4.35-4.35"/>
    </svg>
  )
}
