/**
 * /join/[code] — QR Code Landing Page
 *
 * When someone scans a GP4U QR invite code, they land here.
 * The page:
 *   1. Validates the invite code
 *   2. Shows a contextual welcome message (university, conference, referral)
 *   3. Pre-fills the registration form with the referral context
 *   4. Offers two CTAs: "Join as Customer" and "Join as Provider"
 *
 * Invite codes encode context:
 *   - uni-{slug}:    university invite (e.g. uni-mit-csail)
 *   - ref-{userId}:  referral from existing user
 *   - evt-{slug}:    conference/event invite (e.g. evt-neurips-2024)
 *   - prov-{tier}:   provider recruitment (prov-university, prov-commercial)
 */

import { Metadata } from 'next'
import Link from 'next/link'

interface PageProps {
  params: { code: string }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const ctx = parseCode(params.code)
  return {
    title:       `${ctx.headline} — GP4U`,
    description: ctx.subheadline,
  }
}

// ─── Code parsing ─────────────────────────────────────────────────────────────

interface InviteContext {
  type:        'university' | 'referral' | 'event' | 'provider' | 'generic'
  headline:    string
  subheadline: string
  badge?:      string
  ctaCustomer: string
  ctaProvider: string
  register_url: string
}

function parseCode(code: string): InviteContext {
  const clean = code.toLowerCase().replace(/[^a-z0-9-]/g, '')

  if (clean.startsWith('uni-')) {
    const slug = clean.slice(4).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return {
      type:         'university',
      headline:     `${slug} × GP4U`,
      subheadline:  'Your institution is joining the GP4U university compute network. Students earn from idle GPU time.',
      badge:        'University Partner',
      ctaCustomer:  'Start Computing',
      ctaProvider:  'Connect Your Hardware',
      register_url: `/register?ref=${code}&tier=UNIVERSITY`,
    }
  }

  if (clean.startsWith('evt-')) {
    const slug = clean.slice(4).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return {
      type:         'event',
      headline:     `Welcome from ${slug}`,
      subheadline:  'Scan this code for early access to GP4U — the trusted GPU compute marketplace.',
      badge:        'Conference Invite',
      ctaCustomer:  'Get Free Compute Credits',
      ctaProvider:  'List Your Hardware',
      register_url: `/register?ref=${code}&src=event`,
    }
  }

  if (clean.startsWith('prov-')) {
    const tier = clean.includes('university') ? 'UNIVERSITY' : 'COMMERCIAL'
    return {
      type:         'provider',
      headline:     'Earn From Your Idle GPUs',
      subheadline:  tier === 'UNIVERSITY'
        ? 'Join the GP4U university provider network. Zero cash stake, student program revenue share.'
        : 'Connect your GPU hardware to the GP4U marketplace. Start earning in under 10 minutes.',
      badge:        tier === 'UNIVERSITY' ? 'University Provider' : 'Commercial Provider',
      ctaCustomer:  'I Want Compute',
      ctaProvider:  'Connect My Hardware →',
      register_url: `/providers/register?tier=${tier}&ref=${code}`,
    }
  }

  if (clean.startsWith('ref-')) {
    return {
      type:         'referral',
      headline:     "You've Been Invited to GP4U",
      subheadline:  'Trusted GPU compute at fair prices, with an immutable audit trail behind every job.',
      ctaCustomer:  'Create Account',
      ctaProvider:  'Become a Provider',
      register_url: `/register?ref=${code}`,
    }
  }

  return {
    type:         'generic',
    headline:     'Welcome to GP4U',
    subheadline:  'The trust-layer for distributed GPU compute. Transparent, verifiable, and fair.',
    ctaCustomer:  'Get Started',
    ctaProvider:  'Provide GPU Power',
    register_url: `/register?ref=${code}`,
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function JoinPage({ params }: PageProps) {
  const ctx = parseCode(params.code)

  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md flex flex-col items-center gap-8 text-center">

        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center">
            <span className="text-xl font-black text-white">G</span>
          </div>
          <span className="text-2xl font-black text-white tracking-tight">GP4U</span>
        </div>

        {/* Badge */}
        {ctx.badge && (
          <span className="rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1 text-xs font-semibold text-blue-400">
            {ctx.badge}
          </span>
        )}

        {/* Headline */}
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-black text-white leading-tight">{ctx.headline}</h1>
          <p className="text-zinc-400 leading-relaxed">{ctx.subheadline}</p>
        </div>

        {/* Value props */}
        <div className="w-full grid grid-cols-3 gap-3">
          <ValueProp icon="🔒" label="Zero-knowledge proofs" />
          <ValueProp icon="📒" label="Immutable audit ledger" />
          <ValueProp icon="⚡" label="Live GPU arbitrage" />
        </div>

        {/* CTAs */}
        <div className="w-full flex flex-col gap-3">
          <Link
            href={ctx.register_url}
            className="w-full rounded-2xl bg-blue-500 py-4 text-base font-bold text-white hover:bg-blue-400 transition-colors"
          >
            {ctx.ctaCustomer}
          </Link>
          <Link
            href={`/providers/register?ref=${params.code}`}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-base font-semibold text-white hover:bg-white/10 transition-colors"
          >
            {ctx.ctaProvider}
          </Link>
        </div>

        {/* Trust indicators */}
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Every transaction is recorded on the Obsidian immutable ledger.
          </p>
          <p className="text-xs text-zinc-500">
            Hardware verified with zero-knowledge cryptographic proofs.
          </p>
          <p className="text-xs text-zinc-600 mt-2">
            Invite code: <code className="text-zinc-400">{params.code}</code>
          </p>
        </div>

      </div>
    </main>
  )
}

function ValueProp({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 flex flex-col items-center gap-1">
      <span className="text-xl">{icon}</span>
      <p className="text-xs text-zinc-400 leading-tight">{label}</p>
    </div>
  )
}
