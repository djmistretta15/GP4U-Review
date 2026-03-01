'use client'

/**
 * /help/glossary — full GP4U dictionary
 *
 * Pulls every term from the central glossary.ts and renders them
 * in a searchable, category-filtered, alphabetically-indexed page.
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { GLOSSARY, type GlossaryCategory } from '@/components/ui/glossary'

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORIES: Record<GlossaryCategory, { label: string; icon: string; color: string }> = {
  compute:  { label: 'Compute',        icon: '🖥️', color: 'bg-blue-100   text-blue-700   border-blue-200'   },
  finance:  { label: 'Finance',        icon: '💰', color: 'bg-green-100  text-green-700  border-green-200'  },
  trust:    { label: 'Trust & Proofs', icon: '🔒', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  chambers: { label: 'Chambers',       icon: '⬡',  color: 'bg-amber-100  text-amber-700  border-amber-200'  },
  platform: { label: 'Platform',       icon: '⚙️', color: 'bg-slate-100  text-slate-700  border-slate-200'  },
  energy:   { label: 'Energy',         icon: '⚡', color: 'bg-lime-100   text-lime-700   border-lime-200'   },
}

// ── Guide links per category ──────────────────────────────────────────────────

const CATEGORY_GUIDES: Partial<Record<GlossaryCategory, { href: string; label: string }>> = {
  compute:  { href: '/help/marketplace',    label: 'Marketplace guide' },
  finance:  { href: '/help/billing',        label: 'Billing guide' },
  trust:    { href: '/help/safety',         label: 'Safety guide' },
  chambers: { href: '/admin',               label: 'Admin — Chambers' },
  platform: { href: '/help/providers',      label: 'Provider guide' },
  energy:   { href: '/help/memory-pooling', label: 'Memory pooling guide' },
}

export default function GlossaryPage() {
  const [search,   setSearch]   = useState('')
  const [category, setCategory] = useState<GlossaryCategory | 'all'>('all')

  const entries = useMemo(() => {
    return Object.entries(GLOSSARY)
      .filter(([key, entry]) => {
        const matchesCat = category === 'all' || entry.category === category
        const q = search.toLowerCase()
        const matchesSearch = !q ||
          key.toLowerCase().includes(q) ||
          entry.term.toLowerCase().includes(q) ||
          entry.definition.toLowerCase().includes(q)
        return matchesCat && matchesSearch
      })
      .sort(([, a], [, b]) => a.term.localeCompare(b.term))
  }, [search, category])

  // Build alphabet index from filtered results
  const letters = useMemo(() =>
    [...new Set(entries.map(([, e]) => e.term[0].toUpperCase()))].sort(),
    [entries]
  )

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400">
        <Link href="/help" className="hover:text-slate-600 transition-colors">Help</Link>
        <span>/</span>
        <span className="text-slate-600">Glossary</span>
      </nav>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">📖</span>
            <h1 className="text-2xl font-black text-slate-900">Glossary</h1>
          </div>
          <p className="text-base text-slate-500">
            Every GP4U term defined in plain English. {Object.keys(GLOSSARY).length} definitions across {Object.keys(CATEGORIES).length} categories.
          </p>
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search terms and definitions…"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-400 shadow-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
              category === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            All
          </button>
          {(Object.entries(CATEGORIES) as [GlossaryCategory, typeof CATEGORIES[GlossaryCategory]][]).map(([key, cat]) => (
            <button
              key={key}
              type="button"
              onClick={() => setCategory(key)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${
                category === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : `${cat.color} hover:opacity-80`
              }`}
            >
              {cat.icon} {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Alphabet quick-jump */}
      {letters.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {letters.map(letter => (
            <a
              key={letter}
              href={`#letter-${letter}`}
              className="w-7 h-7 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
            >
              {letter}
            </a>
          ))}
        </div>
      )}

      {/* Results count */}
      <p className="text-xs text-slate-400">
        {entries.length} {entries.length === 1 ? 'term' : 'terms'}
        {search && ` matching "${search}"`}
        {category !== 'all' && ` in ${CATEGORIES[category].label}`}
      </p>

      {/* Term list — grouped by first letter */}
      {entries.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-2xl mb-2">🔍</p>
          <p className="text-sm font-medium text-slate-700">No terms match your search</p>
          <p className="text-xs text-slate-400 mt-1">Try a shorter query or clear the category filter.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {letters.map(letter => {
            const group = entries.filter(([, e]) => e.term[0].toUpperCase() === letter)
            return (
              <div key={letter} id={`letter-${letter}`} className="scroll-mt-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl font-black text-slate-200">{letter}</span>
                  <div className="flex-1 h-px bg-slate-100" />
                </div>
                <div className="space-y-3">
                  {group.map(([key, entry]) => {
                    const cat = CATEGORIES[entry.category]
                    const guide = CATEGORY_GUIDES[entry.category]
                    return (
                      <div
                        key={key}
                        id={`term-${key}`}
                        className="rounded-xl border border-slate-200 bg-white p-4 hover:border-slate-300 transition-colors scroll-mt-6"
                      >
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-900">{entry.term}</p>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${cat.color}`}>
                              {cat.icon} {cat.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {entry.docPath && (
                              <Link
                                href={entry.docPath}
                                className="text-[10px] text-blue-500 hover:text-blue-700 underline"
                              >
                                Docs →
                              </Link>
                            )}
                            {guide && (
                              <Link
                                href={guide.href}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline"
                              >
                                {guide.label} →
                              </Link>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-slate-600 leading-relaxed">{entry.definition}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-8">
        <p className="text-sm font-medium text-slate-700 mb-1">Missing a term?</p>
        <p className="text-sm text-slate-500">
          New terminology is added as the platform grows. If you encounter a term that isn't explained, press <kbd className="inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs font-mono">⌘K</kbd> to search, or email us at support@gp4u.com to request an addition.
        </p>
      </div>

    </div>
  )
}
