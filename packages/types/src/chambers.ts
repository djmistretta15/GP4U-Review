/**
 * @gp4u/types — Chamber Interface + Registry Types
 *
 * A Chamber is a passive data accumulator that can be activated when ready.
 * Think: ship bulkhead doors + space station docking ports.
 *
 * PASSIVE mode:  Chamber receives events, stores telemetry, never routes
 * BACKTEST mode: Chamber replays stored telemetry to validate its model
 * ACTIVE mode:   Chamber actively influences routing/pricing/policy decisions
 *
 * Chambers can be attached and detached without restarting the platform.
 */

import type { PlatformEvent, PlatformEventType } from './events'

// ─── Chamber Lifecycle ────────────────────────────────────────────────────────

export type ChamberMode = 'PASSIVE' | 'BACKTEST' | 'ACTIVE' | 'OFFLINE'

export interface ChamberStatus {
  chamber_id: string
  name: string
  mode: ChamberMode
  events_received: number
  events_since_last_restart: number
  health: 'HEALTHY' | 'DEGRADED' | 'OFFLINE'
  last_event_at: string | null
  activated_at: string | null
  backtest_score: number | null   // % improvement vs baseline — must pass threshold to go ACTIVE
  error?: string
}

// ─── Chamber Interface — implement this to build a new chamber ────────────────

export interface Chamber {
  readonly id: string          // e.g. "aetherion", "mnemo", "energy"
  readonly name: string        // Human readable
  readonly version: string
  readonly subscribes_to: PlatformEventType[]  // Which events it listens to

  /**
   * Called by the event bus for every subscribed event.
   * In PASSIVE/BACKTEST mode: store telemetry only.
   * In ACTIVE mode: optionally return an influence payload.
   */
  onEvent(event: PlatformEvent): Promise<ChamberInfluence | null>

  /**
   * Returns the chamber's current health + metrics.
   * Called by the registry for dashboard display.
   */
  getStatus(): Promise<ChamberStatus>

  /**
   * Run a backtest against stored telemetry.
   * Returns a score (0–100) — must exceed registry threshold to go ACTIVE.
   */
  runBacktest(from: Date, to: Date): Promise<BacktestResult>

  /**
   * Called by the registry when mode changes.
   * Chamber should clean up or initialize accordingly.
   */
  onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void>
}

// ─── Chamber Influence — what an ACTIVE chamber can affect ────────────────────

export interface ChamberInfluence {
  chamber_id: string
  influence_type:
    | 'ROUTING_PREFERENCE'    // Atlas: prefer certain nodes
    | 'PRICE_ADJUSTMENT'      // Marketplace: adjust displayed price
    | 'POLICY_OVERRIDE'       // Aedituus: add a temporary constraint
    | 'ALERT'                 // Dashboard: surface a warning
    | 'MEMORY_SUGGESTION'     // Mnemo: suggest memory reallocation
    | 'ENERGY_ARBITRAGE'      // Energy: suggest lower-cost region
  payload: Record<string, unknown>
  confidence: number          // 0–1, how confident the chamber is
  ttl_seconds: number         // How long this influence stays valid
}

// ─── Backtest ─────────────────────────────────────────────────────────────────

export interface BacktestResult {
  chamber_id: string
  from: string
  to: string
  events_replayed: number
  score: number                // 0–100
  improvement_pct: number      // e.g. 12.3 = "would have saved 12.3%"
  passed: boolean              // score >= registry activation threshold
  summary: string
}

// ─── Registry Config ──────────────────────────────────────────────────────────

export interface ChamberRegistryConfig {
  backtest_threshold: number     // Score required to activate (default: 70)
  max_influence_ttl_seconds: number
  health_check_interval_seconds: number
}
