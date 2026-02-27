/**
 * @gp4u/chamber-registry — Chamber Registry
 *
 * The docking system. Chambers attach and detach here at runtime.
 *
 * Space station analogy:
 *   - dock(chamber)    → attach a docking port, start receiving telemetry
 *   - undock(id)       → detach cleanly, unsubscribe from event bus
 *   - activate(id)     → promote chamber from PASSIVE → ACTIVE after backtest passes
 *   - deactivate(id)   → demote back to PASSIVE (maintenance mode, degraded signal)
 *
 * Ship bulkhead analogy:
 *   - If a chamber's onEvent() throws, the event bus catches it
 *   - Registry health checks detect DEGRADED chambers
 *   - An OFFLINE chamber is automatically undocked and can be re-docked
 *     once repaired — no platform restart needed
 *
 * The registry itself never goes offline. If every chamber is undocked,
 * GP4U core + Custodes keep running normally with zero influence from chambers.
 */

import { getEventBus, type Subscription } from '@gp4u/event-bus'
import type {
  Chamber,
  ChamberMode,
  ChamberStatus,
  ChamberInfluence,
  ChamberRegistryConfig,
  BacktestResult,
} from '@gp4u/types'

interface DockRecord {
  chamber: Chamber
  subscription: Subscription
  docked_at: string
  influence_cache: Map<string, { influence: ChamberInfluence; expires_at: number }>
}

export class ChamberRegistry {
  private docked = new Map<string, DockRecord>()
  private modes = new Map<string, ChamberMode>()
  private config: ChamberRegistryConfig
  private healthCheckTimer?: ReturnType<typeof setInterval>

  constructor(config?: Partial<ChamberRegistryConfig>) {
    this.config = {
      backtest_threshold: config?.backtest_threshold ?? 70,
      max_influence_ttl_seconds: config?.max_influence_ttl_seconds ?? 300,
      health_check_interval_seconds: config?.health_check_interval_seconds ?? 30,
    }
  }

  // ─── Docking ───────────────────────────────────────────────────────────────

  /**
   * Dock a chamber. It immediately begins receiving events in PASSIVE mode.
   * Returns false if already docked.
   */
  dock(chamber: Chamber): boolean {
    if (this.docked.has(chamber.id)) {
      console.warn(`[registry] Chamber ${chamber.id} is already docked`)
      return false
    }

    const bus = getEventBus()
    const influence_cache = new Map<string, { influence: ChamberInfluence; expires_at: number }>()

    const subscription = bus.subscribe(
      `chamber.${chamber.id}`,
      chamber.subscribes_to,
      async (event) => {
        const mode = this.modes.get(chamber.id) ?? 'PASSIVE'
        const influence = await chamber.onEvent(event)

        // Only cache influences when ACTIVE
        if (mode === 'ACTIVE' && influence) {
          const expires_at = Date.now() + influence.ttl_seconds * 1000
          influence_cache.set(influence.influence_type, { influence, expires_at })
        }
      }
    )

    this.docked.set(chamber.id, {
      chamber,
      subscription,
      docked_at: new Date().toISOString(),
      influence_cache,
    })
    this.modes.set(chamber.id, 'PASSIVE')

    console.log(`[registry] Chamber ${chamber.id} docked in PASSIVE mode`)
    chamber.onModeChange('OFFLINE', 'PASSIVE').catch(console.error)

    return true
  }

  /**
   * Undock a chamber cleanly. Unsubscribes from event bus.
   * The chamber stops receiving events immediately.
   */
  async undock(chamber_id: string): Promise<boolean> {
    const record = this.docked.get(chamber_id)
    if (!record) return false

    const previous_mode = this.modes.get(chamber_id) ?? 'PASSIVE'
    record.subscription.unsubscribe()
    this.docked.delete(chamber_id)
    this.modes.delete(chamber_id)

    await record.chamber.onModeChange(previous_mode, 'OFFLINE').catch(console.error)
    console.log(`[registry] Chamber ${chamber_id} undocked`)
    return true
  }

  // ─── Mode Management ───────────────────────────────────────────────────────

  /**
   * Run a backtest and promote to ACTIVE if the score passes threshold.
   * Call this manually or on a scheduled cron once a chamber has enough data.
   */
  async runBacktestAndActivate(
    chamber_id: string,
    from: Date,
    to: Date
  ): Promise<BacktestResult> {
    const record = this.docked.get(chamber_id)
    if (!record) throw new Error(`Chamber ${chamber_id} is not docked`)

    const result = await record.chamber.runBacktest(from, to)

    if (result.passed && result.score >= this.config.backtest_threshold) {
      await this.setMode(chamber_id, 'ACTIVE')
      console.log(
        `[registry] Chamber ${chamber_id} activated — score: ${result.score}, ` +
        `improvement: ${result.improvement_pct.toFixed(1)}%`
      )
    } else {
      console.log(
        `[registry] Chamber ${chamber_id} backtest score ${result.score} below ` +
        `threshold ${this.config.backtest_threshold} — staying PASSIVE`
      )
    }

    return result
  }

  /**
   * Manually set a chamber's mode.
   * Use deactivate() to move ACTIVE → PASSIVE for maintenance.
   */
  async setMode(chamber_id: string, mode: ChamberMode): Promise<void> {
    const record = this.docked.get(chamber_id)
    if (!record) throw new Error(`Chamber ${chamber_id} is not docked`)

    const previous = this.modes.get(chamber_id) ?? 'PASSIVE'
    this.modes.set(chamber_id, mode)
    await record.chamber.onModeChange(previous, mode)
    console.log(`[registry] Chamber ${chamber_id}: ${previous} → ${mode}`)
  }

  // ─── Influence Query ───────────────────────────────────────────────────────

  /**
   * Get the current influence payloads from all ACTIVE chambers.
   * Called by GP4U core (routing, pricing, policy) to apply chamber intelligence.
   *
   * Returns only non-expired influences. Stale ones are pruned automatically.
   */
  getActiveInfluences(influence_type?: ChamberInfluence['influence_type']): ChamberInfluence[] {
    const now = Date.now()
    const results: ChamberInfluence[] = []

    for (const [chamber_id, record] of this.docked) {
      if (this.modes.get(chamber_id) !== 'ACTIVE') continue

      for (const [type, { influence, expires_at }] of record.influence_cache) {
        if (expires_at < now) {
          record.influence_cache.delete(type)
          continue
        }
        if (!influence_type || influence.influence_type === influence_type) {
          results.push(influence)
        }
      }
    }

    // Sort by confidence descending
    return results.sort((a, b) => b.confidence - a.confidence)
  }

  // ─── Status ────────────────────────────────────────────────────────────────

  async getAllStatuses(): Promise<ChamberStatus[]> {
    const statuses: ChamberStatus[] = []
    for (const [chamber_id, record] of this.docked) {
      try {
        const status = await record.chamber.getStatus()
        statuses.push({ ...status, mode: this.modes.get(chamber_id) ?? 'PASSIVE' })
      } catch {
        statuses.push({
          chamber_id,
          name: record.chamber.name,
          mode: 'OFFLINE',
          events_received: 0,
          events_since_last_restart: 0,
          health: 'OFFLINE',
          last_event_at: null,
          activated_at: null,
          backtest_score: null,
          error: 'getStatus() threw',
        })
      }
    }
    return statuses
  }

  getDockedChamberIds(): string[] {
    return [...this.docked.keys()]
  }

  // ─── Health Checks ─────────────────────────────────────────────────────────

  /**
   * Start periodic health checks. Chambers that go OFFLINE are automatically
   * demoted to PASSIVE to stop them influencing routing decisions.
   */
  startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const [chamber_id] of this.docked) {
        const status = await this.docked.get(chamber_id)?.chamber.getStatus().catch(() => null)
        if (status?.health === 'OFFLINE' && this.modes.get(chamber_id) === 'ACTIVE') {
          console.warn(`[registry] Chamber ${chamber_id} went OFFLINE — demoting to PASSIVE`)
          await this.setMode(chamber_id, 'PASSIVE').catch(console.error)
        }
      }
    }, this.config.health_check_interval_seconds * 1000)
  }

  stopHealthChecks(): void {
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer)
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _registry: ChamberRegistry | null = null

export function getChamberRegistry(config?: Partial<ChamberRegistryConfig>): ChamberRegistry {
  if (!_registry) _registry = new ChamberRegistry(config)
  return _registry
}
