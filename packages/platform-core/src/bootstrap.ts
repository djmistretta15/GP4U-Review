/**
 * @gp4u/platform-core — Platform Bootstrap
 *
 * The single startup function that wires every module together.
 * Call this once from your Next.js instrumentation.ts (or server startup).
 *
 * Order of operations:
 *   1. Initialize DB adapters (Prisma connections)
 *   2. Start the event bus
 *   3. Wire Obsidian as the universal event logger (subscribes to everything)
 *   4. Dock chambers in PASSIVE mode
 *   5. Start registry health checks
 *
 * Everything is modular — comment out any step and the rest keeps running.
 * This is the master bulkhead control panel.
 */

import { PrismaClient } from '@prisma/client'
import { getEventBus } from '@gp4u/event-bus'
import { getChamberRegistry, ChamberThresholdWatcher } from '@gp4u/chamber-registry'
import {
  PrismaSubjectStore,
  PrismaLedgerStore,
  MemoryRevocationStore,
  MemorySequenceCounter,
} from '@gp4u/db-adapters'
import { startObsidianSubscriber } from './obsidian-subscriber'
import { MnemoChamber }        from 'chamber.mnemo'
import { AetherionChamber }    from 'chamber.aetherion'
import { OuterimChamber }      from 'chamber.outerim'
import { EnergyBrokerChamber } from 'chamber.energy'
import { VeritasChamber }      from 'chamber.veritas'
import { MistChamber }         from 'chamber.mist'

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
  const subjectStore    = new PrismaSubjectStore(prisma)
  const ledgerStore     = new PrismaLedgerStore(prisma)
  const revocationStore = new MemoryRevocationStore()
  const sequenceCounter = new MemorySequenceCounter()

  _services = { prisma, subjectStore, ledgerStore, revocationStore, sequenceCounter }
  console.log('[platform] DB adapters ready')

  // ── 2. Event Bus ────────────────────────────────────────────────────────────
  const bus = getEventBus()
  console.log('[platform] Event bus ready')

  // ── 3. Obsidian — universal immutable logger ─────────────────────────────────
  // Every event that flows through the bus gets a permanent ledger entry.
  // This is what chambers read during backtesting. Never skip this step.
  startObsidianSubscriber({ ledgerStore, sequenceCounter })

  // ── 4. Chamber Registry ─────────────────────────────────────────────────────
  const registry = getChamberRegistry({
    backtest_threshold:           70,   // Score required to go ACTIVE
    health_check_interval_seconds: 60,
    max_influence_ttl_seconds:    300,
  })

  // ── Dock chambers in PASSIVE mode ───────────────────────────────────────────
  // Each starts silent — observing, recording, never influencing routing.
  // To activate: registry.runBacktestAndActivate('mnemo', fromDate, toDate)
  // To undock:   registry.undock('mnemo')

  // All 6 chambers dock in PASSIVE mode on startup.
  // They observe silently until runBacktestAndActivate() promotes them.
  registry.dock(new MnemoChamber())
  registry.dock(new AetherionChamber())
  registry.dock(new OuterimChamber())
  registry.dock(new EnergyBrokerChamber())
  registry.dock(new VeritasChamber())
  registry.dock(new MistChamber())

  registry.startHealthChecks()

  const docked = registry.getDockedChamberIds()
  console.log(`[platform] Chamber registry started — ${docked.length} chamber(s) docked: [${docked.join(', ')}]`)

  // ── 5. Threshold Watcher ─────────────────────────────────────────────────────
  // Polls every 5 min; promotes chambers from PASSIVE → ACTIVE once they
  // accumulate enough telemetry and pass their backtest.
  const watcher = new ChamberThresholdWatcher(registry, {
    poll_interval_ms: 5 * 60 * 1000,
  })
  watcher.start()
  console.log('[platform] Chamber threshold watcher started')

  console.log('[platform] GP4U platform bootstrap complete')
  console.log(`[platform] Bus stats: ${JSON.stringify(bus.getStats())}`)

  return _services
}
