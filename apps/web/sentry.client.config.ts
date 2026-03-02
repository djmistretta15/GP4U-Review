/**
 * Sentry — Browser (client-side) configuration
 *
 * This file is automatically loaded by Next.js via the Sentry webpack plugin.
 * Set SENTRY_DSN (server env) and NEXT_PUBLIC_SENTRY_DSN (public env) to enable.
 *
 * Docs: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment:      process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Capture replay for 10% of sessions, 100% of sessions with errors
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and inputs by default
        maskAllText:   true,
        blockAllMedia: false,
      }),
    ],

    // Don't send personally identifiable info in breadcrumbs
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
        // Scrub Authorization headers from breadcrumbs
        if (breadcrumb.data?.headers?.Authorization) {
          breadcrumb.data.headers.Authorization = '[Filtered]'
        }
      }
      return breadcrumb
    },
  })
}
