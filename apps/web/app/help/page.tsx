import Link from 'next/link'
import { PageHeader } from '@/components/ui/page-header'

/**
 * /help — GP4U Help Hub
 *
 * The front page of the help system. Links to every guide,
 * the glossary, and surfaces the most popular articles.
 */

const GUIDES = [
  {
    href:        '/help/getting-started',
    icon:        '🚀',
    title:       'Getting Started',
    description: 'Create your account, add credits, and run your first GPU job in under 5 minutes.',
    time:        '4 min read',
    tag:         'Start here',
    tagColor:    'bg-green-100 text-green-700',
  },
  {
    href:        '/help/safety',
    icon:        '🔒',
    title:       'Safety & Trust',
    description: 'How your money is protected: escrow, ZK proofs, the Obsidian ledger, and dispute resolution.',
    time:        '6 min read',
    tag:         'Important',
    tagColor:    'bg-blue-100 text-blue-700',
  },
  {
    href:        '/help/marketplace',
    icon:        '🛒',
    title:       'Marketplace & GPUs',
    description: 'How real-time GPU pricing works, how to use the Arbitrage tool, and how to pick the right hardware.',
    time:        '5 min read',
  },
  {
    href:        '/help/memory-pooling',
    icon:        '💾',
    title:       'Memory Pooling',
    description: 'Stake idle VRAM for passive yield. How rates work, risks to understand, and how to get started.',
    time:        '5 min read',
  },
  {
    href:        '/help/providers',
    icon:        '🏗️',
    title:       'Becoming a Provider',
    description: 'Connect your GPU hardware, choose a tier, install the agent, and start earning compute revenue.',
    time:        '7 min read',
  },
  {
    href:        '/help/billing',
    icon:        '💳',
    title:       'Billing & Payments',
    description: 'Credits, fee schedule, 90-day refund policy, and how every transaction is traceable.',
    time:        '4 min read',
  },
  {
    href:        '/help/glossary',
    icon:        '📖',
    title:       'Glossary / Dictionary',
    description: 'Every GP4U term defined in plain English — VRAM, ZK proof, slash, Obsidian, chamber, and 35+ more.',
    time:        'Reference',
    tag:         'Dictionary',
    tagColor:    'bg-purple-100 text-purple-700',
  },
]

const POPULAR = [
  { href: '/help/getting-started#add-credits',    label: 'How do I add credits?' },
  { href: '/help/safety#escrow',                  label: 'What happens if a job fails?' },
  { href: '/help/billing#refund',                 label: 'Can I get a refund?' },
  { href: '/help/providers#slash-conditions',     label: 'What are the slash conditions?' },
  { href: '/help/memory-pooling#yield',           label: 'How is yield calculated?' },
  { href: '/help/marketplace#workload-advisor',   label: 'How does the Workload Advisor work?' },
  { href: '/help/safety#zk-proof',                label: 'What is a ZK proof?' },
  { href: '/help/providers#install',              label: 'How do I install the provider agent?' },
]

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Help Centre"
        description="Guides, walkthroughs, and answers to every question about GP4U."
        breadcrumbs={[{ label: 'Help' }]}
      />

      {/* Search prompt */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-medium text-slate-700 mb-2">Looking for something specific?</p>
        <p className="text-sm text-slate-500">
          Press <kbd className="inline-flex items-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-mono">⌘K</kbd> anywhere to search across all guides and definitions.
        </p>
      </div>

      {/* All guides */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">All guides</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GUIDES.map(g => (
            <Link
              key={g.href}
              href={g.href}
              className="group flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <span className="text-3xl flex-shrink-0">{g.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-bold text-slate-900 group-hover:text-blue-700 transition-colors">{g.title}</p>
                  {g.tag && (
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${g.tagColor}`}>
                      {g.tag}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 leading-relaxed mb-2">{g.description}</p>
                <p className="text-[10px] text-slate-400">{g.time}</p>
              </div>
              <span className="text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all flex-shrink-0">→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Popular questions */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-widest mb-4">Popular questions</h2>
        <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden shadow-sm">
          {POPULAR.map(q => (
            <Link
              key={q.href}
              href={q.href}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition-colors group"
            >
              <span className="text-sm text-slate-700 group-hover:text-blue-600">{q.label}</span>
              <span className="text-slate-300 group-hover:text-blue-400 text-xs">→</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Contact */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-1">Didn't find your answer?</p>
        <p className="text-sm text-slate-500 mb-3">
          Every question you ask makes the platform better.
          Open a support ticket or start a community discussion.
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href="mailto:support@gp4u.com"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors"
          >
            ✉️ support@gp4u.com
          </a>
          <a
            href="https://github.com/gp4u/gp4u/discussions"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-slate-300 transition-colors"
          >
            💬 Community discussions
          </a>
        </div>
      </div>

    </div>
  )
}
