/**
 * Monitoring — Sentry wrapper with console fallback
 *
 * All error reporting and performance tracking goes through this module.
 * In production (SENTRY_DSN set): events sent to Sentry.
 * In development: errors logged to console only.
 *
 * Usage:
 *   import { captureError, captureMessage } from '@/lib/monitoring'
 *   captureError(new Error('something failed'), { context: 'billing' })
 */

type Extras = Record<string, unknown>

// ─── Server-side ──────────────────────────────────────────────────────────────

export async function captureError(error: Error, extras?: Extras): Promise<void> {
  const dsn = process.env.SENTRY_DSN

  if (!dsn) {
    console.error('[monitoring] ERROR:', error.message, extras ?? '')
    return
  }

  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.withScope(scope => {
      if (extras) scope.setExtras(extras)
      Sentry.captureException(error)
    })
  } catch {
    console.error('[monitoring] Sentry not installed — ERROR:', error.message)
  }
}

export async function captureMessage(
  message: string,
  level: 'info' | 'warning' | 'error' = 'info',
  extras?: Extras,
): Promise<void> {
  const dsn = process.env.SENTRY_DSN

  if (!dsn) {
    console.log(`[monitoring] ${level.toUpperCase()}: ${message}`, extras ?? '')
    return
  }

  try {
    const Sentry = await import('@sentry/nextjs')
    Sentry.withScope(scope => {
      if (extras) scope.setExtras(extras)
      Sentry.captureMessage(message, level)
    })
  } catch {
    console.log(`[monitoring] Sentry not installed — ${level}: ${message}`)
  }
}

// ─── Client-side (call from ErrorBoundary.componentDidCatch) ──────────────────

export function captureClientError(error: Error, context?: string): void {
  const message = `[${context ?? 'client'}] ${error.message}`

  if (typeof window === 'undefined') return

  // Dynamic import so this doesn't block the bundle
  import('@sentry/nextjs').then(Sentry => {
    Sentry.captureException(error)
  }).catch(() => {
    console.error(message, error)
  })
}
