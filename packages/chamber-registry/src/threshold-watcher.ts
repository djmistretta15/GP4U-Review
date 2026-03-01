/**
 * Chamber Threshold Watcher
 *
 * Monitors event counts for each docked chamber and automatically triggers
 * runBacktestAndActivate() when a chamber has accumulated enough telemetry.
 *
 * Thresholds per chamber (tunable):
 *   mnemo      — 20 events  (memory demand/supply pairs)
 *   aetherion  — 30 events  (need 10+ route records for backtest)
 *   energy     — 20 events  (need 5+ energy records)
 *   veritas    — 15 events  (need 5+ provenance records)
 *   outerim    — 10 events  (edge supply tracking)
 *   mist       — 10 events  (arbitrage spread tracking)
 *
 * Lifecycle:
 *   start()  → begin polling (default: every 5 min)
 *   stop()   → clear interval
 *   nudge()  → force an immediate check (useful after bulk seed events)
 *
 * Bulkhead: a failing backtest never crashes the watcher loop.
 * If backtest returns passed=false the chamber stays PASSIVE and
 * the watcher continues polling — it will retry next cycle.
 */

import type { ChamberStatus } from '@gp4u/types'
import { ChamberRegistry } from './registry'

export interface ThresholdConfig {
  chamber_id: string
  min_events: number
  backtest_window_hours: number  // how far back to look for backtest data
}

export interface WatcherConfig {
  poll_interval_ms: number
  thresholds: ThresholdConfig[]
}

const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { chamber_id: 'mnemo',     min_events: 20, backtest_window_hours: 24 },
  { chamber_id: 'aetherion', min_events: 30, backtest_window_hours: 24 },
  { chamber_id: 'energy',    min_events: 20, backtest_window_hours: 24 },
  { chamber_id: 'veritas',   min_events: 15, backtest_window_hours: 24 },
  { chamber_id: 'outerim',   min_events: 10, backtest_window_hours: 24 },
  { chamber_id: 'mist',      min_events: 10, backtest_window_hours: 24 },
]

export class ChamberThresholdWatcher {
  private timer?: ReturnType<typeof setInterval>
  private readonly config: WatcherConfig
  private readonly registry: ChamberRegistry
  // Track which chambers have been promoted to avoid redundant backtests
  private promoted = new Set<string>()

  constructor(registry: ChamberRegistry, config?: Partial<WatcherConfig>) {
    this.registry = registry
    this.config = {
      poll_interval_ms: config?.poll_interval_ms ?? 5 * 60 * 1000, // 5 min default
      thresholds: config?.thresholds ?? DEFAULT_THRESHOLDS,
    }
  }

  start(): void {
    console.log(
      `[threshold-watcher] Starting — poll every ${this.config.poll_interval_ms / 1000}s, ` +
      `watching ${this.config.thresholds.length} chamber(s)`
    )
    this.timer = setInterval(() => this.check().catch(console.error), this.config.poll_interval_ms)
    // Run immediately on start
    this.check().catch(console.error)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
      console.log('[threshold-watcher] Stopped')
    }
  }

  /** Force an immediate check outside the normal poll cycle. */
  async nudge(): Promise<void> {
    return this.check()
  }

  private async check(): Promise<void> {
    const statuses = await this.registry.getAllStatuses()
    const statusMap = new Map<string, ChamberStatus>(statuses.map(s => [s.chamber_id, s]))

    for (const threshold of this.config.thresholds) {
      const { chamber_id, min_events, backtest_window_hours } = threshold
      const status = statusMap.get(chamber_id)

      if (!status) continue  // Not docked
      if (status.mode === 'ACTIVE') {
        // Already active — mark as promoted and skip
        this.promoted.add(chamber_id)
        continue
      }
      if (this.promoted.has(chamber_id)) continue  // Don't re-run after ACTIVE → PASSIVE demotion unless reset

      const received = status.events_received ?? 0
      if (received < min_events) {
        console.log(
          `[threshold-watcher] ${chamber_id}: ${received}/${min_events} events — waiting`
        )
        continue
      }

      // Threshold met — trigger backtest
      console.log(
        `[threshold-watcher] ${chamber_id}: threshold met (${received} events) — running backtest`
      )

      const to   = new Date()
      const from = new Date(to.getTime() - backtest_window_hours * 60 * 60 * 1000)

      try {
        const result = await this.registry.runBacktestAndActivate(chamber_id, from, to)
        if (result.passed) {
          this.promoted.add(chamber_id)
          console.log(
            `[threshold-watcher] ${chamber_id} ACTIVATED — ` +
            `score: ${result.score}, improvement: ${result.improvement_pct}%`
          )
        } else {
          console.log(
            `[threshold-watcher] ${chamber_id} backtest score ${result.score} < 70 — ` +
            `will retry next poll (${result.summary})`
          )
        }
      } catch (err) {
        // Bulkhead: never crash the watcher loop
        console.error(`[threshold-watcher] ${chamber_id} backtest error (will retry):`, err)
      }
    }
  }

  /** Reset promotion state for a specific chamber (e.g. after undock + re-dock). */
  resetPromotion(chamber_id: string): void {
    this.promoted.delete(chamber_id)
  }

  /** Returns current watcher state for admin UI. */
  getState(): Array<{
    chamber_id: string
    min_events: number
    promoted: boolean
  }> {
    return this.config.thresholds.map(t => ({
      chamber_id:  t.chamber_id,
      min_events:  t.min_events,
      promoted:    this.promoted.has(t.chamber_id),
    }))
  }
}
