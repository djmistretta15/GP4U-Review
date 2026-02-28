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
  // Only run on the Node.js server — not in edge runtime or client
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { bootstrapPlatform } = await import('@gp4u/platform-core')
    await bootstrapPlatform()
  }
}
