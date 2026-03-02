/**
 * Root Layout — GP4U App Shell
 * ==============================
 *
 * Wraps every page with:
 *   - Persistent sidebar navigation (collapsible on mobile)
 *   - Global search bar (Cmd+K) always accessible in header
 *   - Platform status indicator (chambers active, ledger live)
 *   - Trust indicators in the footer (Obsidian ledger, ZK proofs live)
 *   - Workload Advisor floating widget
 *
 * Design principles:
 *   - Navigation is always findable — sidebar with clear icons + labels
 *   - Search is always one keypress away (Cmd+K from anywhere)
 *   - Every jargon term has a definition accessible in-place
 *   - The platform's trustworthiness is visible in the shell, not hidden
 */

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Link from 'next/link'
import './globals.css'
import { GlobalSearch } from '@/components/ui/global-search'
import { WorkloadAdvisor } from '@/components/workload-advisor'
import { RootErrorBoundary } from '@/components/error-boundary'
import { AuthProvider } from '@/components/auth-provider'
import { UserMenu } from '@/components/user-menu'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title:       'GP4U — Trusted GPU Compute',
  description: 'Transparent, verifiable GPU compute. Zero-knowledge proofs. Immutable audit ledger. Cross-cloud arbitrage.',
}

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard',   icon: DashboardIcon,  description: 'Jobs and stats' },
  { href: '/arbitrage', label: 'Arbitrage',   icon: ArbitrageIcon,  description: 'Compare GPU prices' },
  { href: '/memory',    label: 'Memory',       icon: MemoryIcon,     description: 'Stake VRAM for yield' },
  { href: '/clusters',  label: 'Clusters',     icon: ClustersIcon,   description: 'Multi-GPU reservations' },
  { href: '/billing',   label: 'Billing',      icon: BillingIcon,    description: 'Credits & payments' },
  { href: '/admin',     label: 'Admin',        icon: AdminIcon,      description: 'Chambers & ledger' },
  { href: '/help',      label: 'Help',         icon: HelpIcon,       description: 'Guides & glossary' },
] as const

// ─── Layout ───────────────────────────────────────────────────────────────────

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${inter.className} h-full bg-slate-50 text-slate-900 antialiased`}>
        <RootErrorBoundary>
        <AuthProvider>
        <div className="flex h-full">

          {/* ── Sidebar ────────────────────────────────────────────────────── */}
          <aside className="hidden md:flex md:flex-col md:w-56 md:fixed md:inset-y-0 border-r border-slate-200 bg-white z-30">

            {/* Logo */}
            <div className="flex items-center gap-2.5 px-5 py-4 border-b border-slate-100">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-black">G</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-slate-900 leading-none">GP4U</p>
                <p className="text-[10px] text-slate-400 leading-none mt-0.5">Trusted Compute</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {NAV_ITEMS.map(item => (
                <NavItem key={item.href} {...item} />
              ))}
            </nav>

            {/* Trust indicators in sidebar footer */}
            <div className="px-4 py-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <p className="text-[10px] text-slate-500">Obsidian Ledger live</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <p className="text-[10px] text-slate-500">ZK proofs active</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                <p className="text-[10px] text-slate-500">Chambers watching</p>
              </div>
            </div>

            {/* Docs link at bottom */}
            <div className="px-3 pb-4">
              <Link
                href="/docs"
                className="flex items-center gap-2 w-full rounded-lg px-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
              >
                <DocsIcon />
                Documentation
              </Link>
            </div>

          </aside>

          {/* ── Main content area ────────────────────────────────────────────── */}
          <div className="flex-1 flex flex-col md:ml-56">

            {/* ── Top header ────────────────────────────────────────────────── */}
            <header className="sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-white/95 backdrop-blur border-b border-slate-200">

              {/* Mobile: logo */}
              <div className="flex md:hidden items-center gap-2 flex-shrink-0">
                <div className="w-6 h-6 rounded-md bg-blue-600 flex items-center justify-center">
                  <span className="text-white text-[10px] font-black">G</span>
                </div>
              </div>

              {/* Search — always visible */}
              <div className="flex-1 max-w-sm">
                <GlobalSearch variant="bar" />
              </div>

              {/* Right: platform indicators */}
              <div className="hidden sm:flex items-center gap-3 ml-auto flex-shrink-0">
                <TrustPill />
                <div className="h-5 border-r border-slate-200" />
                <UserMenu />
              </div>

            </header>

            {/* ── Page content ──────────────────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto">
              <div className="container mx-auto px-4 py-8 max-w-6xl">
                {children}
              </div>
            </main>

            {/* ── Footer ────────────────────────────────────────────────────── */}
            <footer className="border-t border-slate-200 bg-white px-4 py-3">
              <div className="flex items-center justify-between max-w-6xl mx-auto">
                <p className="text-xs text-slate-400">
                  Every action is sealed in the{' '}
                  <Link href="/docs/architecture#obsidian" className="underline hover:text-slate-600">
                    Obsidian immutable ledger
                  </Link>
                  .
                </p>
                <div className="flex items-center gap-4">
                  <Link href="/docs" className="text-xs text-slate-400 hover:text-slate-600">Docs</Link>
                  <Link href="/docs/api-reference" className="text-xs text-slate-400 hover:text-slate-600">API</Link>
                  <Link href="/docs/staking-and-slashing" className="text-xs text-slate-400 hover:text-slate-600">Trust & Safety</Link>
                </div>
              </div>
            </footer>

          </div>
        </div>

        {/* Workload Advisor — always available */}
        <WorkloadAdvisor />

        </AuthProvider>
        </RootErrorBoundary>
      </body>
    </html>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  description,
}: {
  href:        string
  label:       string
  icon:        React.FC<{ className?: string }>
  description: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors group"
      title={description}
    >
      <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-600 flex-shrink-0" />
      {label}
    </Link>
  )
}

/**
 * Small trust status pill in the header.
 * Clicking opens the admin page for details.
 */
function TrustPill() {
  return (
    <Link
      href="/admin"
      className="hidden lg:flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors"
      title="Platform trust status — click for details"
    >
      <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      Platform Live
    </Link>
  )
}

// ─── Nav icons (inline SVG — no external deps) ────────────────────────────────

function DashboardIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  )
}

function ArbitrageIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 17L17 7"/>
      <path d="M17 7H8M17 7v9"/>
    </svg>
  )
}

function MemoryIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="5" width="20" height="14" rx="2"/>
      <path d="M6 5v14M10 5v14M14 5v14M18 5v14"/>
      <path d="M2 12h20"/>
    </svg>
  )
}

function ClustersIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2" y="2" width="9" height="9" rx="1"/>
      <rect x="13" y="2" width="9" height="9" rx="1"/>
      <rect x="2" y="13" width="9" height="9" rx="1"/>
      <rect x="13" y="13" width="9" height="9" rx="1"/>
    </svg>
  )
}

function AdminIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  )
}

function BillingIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}

function HelpIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  )
}

function DocsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/>
      <line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  )
}
