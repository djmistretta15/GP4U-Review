/**
 * Next.js Instrumentation — Platform Bootstrap Entry Point
 *
 * Next.js calls this file once on server startup before any routes are served.
 * This is where we boot the entire GP4U platform: DB adapters, event bus,
 * Obsidian logger, and all docked chambers.
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Sentry — error monitoring (no-op if SENTRY_DSN is not set)
    if (process.env.SENTRY_DSN) {
      await import('./sentry.server.config')
    }

    // GP4U platform bootstrap — DB adapters, event bus, Obsidian, chambers
    const { bootstrapPlatform } = await import('@gp4u/platform-core')
    await bootstrapPlatform()
  }
}
