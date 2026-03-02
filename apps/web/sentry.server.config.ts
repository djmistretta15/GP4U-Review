/**
 * Sentry — Server-side configuration
 *
 * Loaded by Next.js instrumentation hook (instrumentation.ts).
 * Set SENTRY_DSN to enable.
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:      process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

    // Don't send sensitive fields to Sentry
    beforeSend(event) {
      // Scrub database URLs from error context
      if (event.extra?.DATABASE_URL) delete event.extra.DATABASE_URL
      return event
    },
  })
}
