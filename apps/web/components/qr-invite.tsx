'use client'

/**
 * QR Invite Component
 * ====================
 *
 * Renders a QR code for sharing GP4U invite links. Used in:
 *   - User dashboard:          share your referral link
 *   - Provider dashboard:      display at a university or conference
 *   - Registration completion: "Share GP4U with your team"
 *   - Admin:                   generate provider recruitment QR codes
 *
 * The QR code is fetched from /api/qr as an SVG image.
 * Includes a copy-link button and download button.
 */

import { useState } from 'react'

interface QrInviteProps {
  type:          'invite' | 'provider' | 'register' | 'job'
  ref_code?:     string   // invite code / referral code
  job_id?:       string
  tier?:         'UNIVERSITY' | 'COMMERCIAL'
  size?:         number
  label?:        string   // caption displayed below QR
  showCopyLink?: boolean
}

export function QrInvite({
  type,
  ref_code,
  job_id,
  tier,
  size = 180,
  label,
  showCopyLink = true,
}: QrInviteProps) {
  const [copied, setCopied] = useState(false)

  // Build the QR API URL
  const params = new URLSearchParams({ type, size: String(size) })
  if (ref_code) params.set('ref', ref_code)
  if (job_id)   params.set('id', job_id)
  if (tier)     params.set('tier', tier)
  const qr_src = `/api/qr?${params.toString()}`

  // Build the human-readable link for copy
  const base = typeof window !== 'undefined' ? window.location.origin : 'https://gp4u.com'
  const share_url =
    type === 'invite'   ? `${base}/join/${ref_code ?? 'default'}` :
    type === 'provider' ? `${base}/providers/register${tier ? `?tier=${tier}` : ''}` :
    type === 'job'      ? `${base}/jobs/${job_id ?? ''}` :
    `${base}/register${ref_code ? `?ref=${ref_code}` : ''}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(share_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available (e.g. http in dev)
    }
  }

  const handleDownload = () => {
    const a = document.createElement('a')
    a.href = qr_src
    a.download = `gp4u-qr-${type}.svg`
    a.click()
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* QR Code Image */}
      <div className="rounded-2xl border border-white/10 bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr_src}
          alt={`GP4U ${type} QR code`}
          width={size}
          height={size + 28}
          className="rounded-lg"
        />
      </div>

      {/* Label */}
      {label && (
        <p className="text-xs text-zinc-400 text-center max-w-[180px] leading-relaxed">{label}</p>
      )}

      {/* Action buttons */}
      {showCopyLink && (
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
          >
            {copied ? '✓ Copied!' : '⎘ Copy Link'}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/10 transition-colors"
            title="Download QR code as SVG"
          >
            ↓ Download
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Pre-built usage patterns ──────────────────────────────────────────────────

/**
 * Dashboard invite widget — user shares their referral link
 */
export function DashboardInviteQr({ user_id }: { user_id: string }) {
  return (
    <QrInvite
      type="invite"
      ref_code={`ref-${user_id.slice(0, 8)}`}
      label="Invite friends. Earn compute credits when they join."
      size={160}
    />
  )
}

/**
 * University provider recruitment QR — show at campus events
 */
export function UniversityProviderQr({ institution_slug }: { institution_slug: string }) {
  return (
    <QrInvite
      type="provider"
      ref_code={`uni-${institution_slug}`}
      tier="UNIVERSITY"
      label="Scan to connect your institution's hardware to GP4U"
      size={200}
    />
  )
}

/**
 * Conference/event QR — print on badge or display at booth
 */
export function EventQr({ event_slug, size = 250 }: { event_slug: string; size?: number }) {
  return (
    <QrInvite
      type="invite"
      ref_code={`evt-${event_slug}`}
      label={`Scan for early access — ${event_slug.replace(/-/g, ' ')}`}
      size={size}
      showCopyLink={false}
    />
  )
}

/**
 * Job sharing QR — share a specific job config with teammates
 */
export function JobShareQr({ job_id }: { job_id: string }) {
  return (
    <QrInvite
      type="job"
      job_id={job_id}
      label="Share this job config with your team"
      size={150}
    />
  )
}
