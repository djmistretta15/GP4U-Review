/**
 * @gp4u/platform-core — Platform Bootstrap
 *
 * The single startup function that wires every module together.
 * Call this once from your Next.js instrumentation.ts (or server startup).
 *
 * Order of operations:
 *   1. Initialize DB adapters (Prisma connections)
 *   2. Start the event bus
 *   3. Wire Obsidian as the universal event logger (it subscribes to everything)
 *   4. Dock any pre-configured chambers in PASSIVE mode
 *   5. Start registry health checks
 *
 * Everything is modular — you can comment out any step and the rest
 * of the platform keeps running. This is the master bulkhead control.
 */

import { PrismaClient } from '@prisma/client'
import { getEventBus } from '@gp4u/event-bus'
import { getChamberRegistry } from '@gp4u/chamber-registry'
import {
  PrismaSubjectStore,
  PrismaLedgerStore,
  MemoryRevocationStore,
  MemorySequenceCounter,
} from '@gp4u/db-adapters'

export interface PlatformServices {
  prisma: PrismaClient
  subjectStore: PrismaSubjectStore
  ledgerStore: PrismaLedgerStore
  revocationStore: MemoryRevocationStore
  sequenceCounter: MemorySequenceCounter
}

let _services: PlatformServices | null = null

export function getPlatformServices(): PlatformServices {
  if (!_services) throw new Error('Platform not bootstrapped. Call bootstrapPlatform() first.')
  return _services
}

export async function bootstrapPlatform(): Promise<PlatformServices> {
  if (_services) return _services

  console.log('[platform] Bootstrapping GP4U platform...')

  // ── 1. Database ─────────────────────────────────────────────────────────────
  const prisma = new PrismaClient()

  const subjectStore = new PrismaSubjectStore(prisma)
  const ledgerStore = new PrismaLedgerStore(prisma)
  const revocationStore = new MemoryRevocationStore()
  const sequenceCounter = new MemorySequenceCounter()

  _services = { prisma, subjectStore, ledgerStore, revocationStore, sequenceCounter }

  // ── 2. Event Bus ────────────────────────────────────────────────────────────
  const bus = getEventBus()
  console.log('[platform] Event bus ready')

  // ── 3. Obsidian universal logger ────────────────────────────────────────────
  // Obsidian subscribes to ALL events and writes them to the immutable ledger.
  // This is what fills the chamber telemetry store and enables backtesting.
  // Note: full Obsidian integration wires ObsidianLedgerService here.
  // For now the ledger store is ready to receive entries from that service.
  console.log('[platform] Obsidian ledger store ready — awaiting full Custodes wiring')

  // ── 4. Chamber Registry ─────────────────────────────────────────────────────
  const registry = getChamberRegistry({
    backtest_threshold: 70,
    health_check_interval_seconds: 60,
  })

  // Chambers are docked here as you build them.
  // Uncomment each line when the chamber package exists:
  //
  // import { AetherionChamber } from 'chamber.aetherion'
  // registry.dock(new AetherionChamber())
  //
  // import { MnemoChamber } from 'chamber.mnemo'
  // registry.dock(new MnemoChamber())
  //
  // Each chamber starts in PASSIVE mode automatically.
  // Call registry.runBacktestAndActivate(id, from, to) on a cron
  // once the chamber reports enough events.

  registry.startHealthChecks()
  console.log('[platform] Chamber registry started — 0 chambers docked (add chambers above)')

  // ── 5. Instrument the arbitrage API to emit events ──────────────────────────
  // The arbitrage route should call publishArbitrageCalculated() after each
  // comparison. That single event fills Mist, Energy, and Aetherion simultaneously.
  // See apps/web/app/api/arbitrage/route.ts for the wiring point.

  console.log('[platform] GP4U platform bootstrap complete')
  console.log(`[platform] Event bus stats: ${JSON.stringify(bus.getStats())}`)

  return _services
}
