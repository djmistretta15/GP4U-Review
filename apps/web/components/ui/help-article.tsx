'use client'

/**
 * HelpArticle — shared layout for all /help/* guide pages
 * =========================================================
 *
 * Wraps every guide page with:
 *   - Breadcrumbs
 *   - Title + meta (reading time, start tour button)
 *   - Sticky table of contents (desktop)
 *   - Article body
 *   - "Was this helpful?" feedback bar
 *   - Related articles footer
 */

import Link from 'next/link'
import { GuidedTour } from '@/components/ui/guided-tour'
import type { ComponentType } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RelatedArticle {
  href:        string
  title:       string
  description: string
  icon:        string
}

export interface TocItem {
  id:    string
  label: string
}

interface HelpArticleProps {
  title:       string
  description: string
  icon:        string
  readingTime: string
  tourId?:     string
  toc?:        TocItem[]
  related?:    RelatedArticle[]
  children:    React.ReactNode
}

// ── Feedback widget (client island) ──────────────────────────────────────────

function FeedbackBar() {
  return (
    <div className="mt-12 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center gap-3">
      <p className="text-sm text-slate-500 mr-2">Was this page helpful?</p>
      <div className="flex gap-2">
        {['👍 Yes', '👎 No', '💬 Suggest an edit'].map(label => (
          <button
            key={label}
            type="button"
            onClick={() => {}}
            className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HelpArticle({
  title,
  description,
  icon,
  readingTime,
  tourId,
  toc = [],
  related = [],
  children,
}: HelpArticleProps) {
  return (
    <div className="max-w-5xl mx-auto">

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-xs text-slate-400 mb-6">
        <Link href="/help" className="hover:text-slate-600 transition-colors">Help</Link>
        <span>/</span>
        <span className="text-slate-600">{title}</span>
      </nav>

      <div className="flex gap-10">

        {/* ── Main content ──────────────────────────────────────────────── */}
        <article className="flex-1 min-w-0">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{icon}</span>
                <h1 className="text-2xl font-black text-slate-900">{title}</h1>
              </div>
              {tourId && (
                <GuidedTour tourId={tourId as any} className="flex-shrink-0" />
              )}
            </div>
            <p className="text-base text-slate-500 mb-3">{description}</p>
            <p className="text-xs text-slate-400">📖 {readingTime} read</p>
          </div>

          {/* Article body */}
          <div className="prose-guide">
            {children}
          </div>

          {/* Feedback */}
          <FeedbackBar />

          {/* Related articles */}
          {related.length > 0 && (
            <div className="mt-10">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">Related guides</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {related.map(r => (
                  <Link
                    key={r.href}
                    href={r.href}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-all group"
                  >
                    <span className="text-xl flex-shrink-0">{r.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{r.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

        </article>

        {/* ── Sticky TOC (desktop only) ──────────────────────────────────── */}
        {toc.length > 0 && (
          <aside className="hidden xl:block w-48 flex-shrink-0">
            <div className="sticky top-6">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">On this page</p>
              <nav className="space-y-1">
                {toc.map(item => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="block text-xs text-slate-500 hover:text-blue-600 py-1 hover:translate-x-0.5 transition-all"
                  >
                    {item.label}
                  </a>
                ))}
              </nav>
            </div>
          </aside>
        )}

      </div>
    </div>
  )
}

// ── Prose helpers — re-usable section building blocks ─────────────────────────

export function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mb-10 scroll-mt-6">
      <h2 className="text-lg font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100">{title}</h2>
      {children}
    </section>
  )
}

export function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 mb-5">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
        <span className="text-white text-xs font-bold">{number}</span>
      </div>
      <div className="flex-1 pb-5 border-b border-slate-100 last:border-0">
        <p className="text-sm font-semibold text-slate-800 mb-1">{title}</p>
        <div className="text-sm text-slate-600 leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

export function CalloutBox({
  type = 'info',
  title,
  children,
}: {
  type?: 'info' | 'warning' | 'success' | 'tip'
  title?: string
  children: React.ReactNode
}) {
  const styles = {
    info:    { bg: 'bg-blue-50 border-blue-200',   icon: 'ℹ️',  text: 'text-blue-800'  },
    warning: { bg: 'bg-amber-50 border-amber-200', icon: '⚠️',  text: 'text-amber-800' },
    success: { bg: 'bg-green-50 border-green-200', icon: '✅',  text: 'text-green-800' },
    tip:     { bg: 'bg-purple-50 border-purple-200', icon: '💡', text: 'text-purple-800' },
  }
  const s = styles[type]
  return (
    <div className={`rounded-xl border ${s.bg} p-4 my-4`}>
      {title && (
        <p className={`text-sm font-semibold ${s.text} mb-1 flex items-center gap-2`}>
          <span>{s.icon}</span>{title}
        </p>
      )}
      <div className={`text-sm ${s.text} leading-relaxed`}>{children}</div>
    </div>
  )
}

export function FactRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="text-right">
        <span className="text-sm font-medium text-slate-800">{value}</span>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}
