/**
 * @gp4u/russian-doll-bridge — The Bridge
 *
 * Receives Russian-Doll telemetry and fans it out to:
 *   1. Tutela (threat detection via event bus anomaly.detected events)
 *   2. Energy Broker chamber (energy.consumed events)
 *   3. Veritas chamber (provenance via job.completed events)
 *   4. Obsidian ledger (automatic — any event published goes in)
 *
 * Usage:
 *   const bridge = new RussianDollBridge()
 *   await bridge.ingest(russianDollMetrics)
 *
 * Bulkhead: Each downstream publish is wrapped in try/catch.
 * A failing Obsidian write never blocks the Tutela response.
 */

import { getEventBus } from '@gp4u/event-bus'
import type { RussianDollJobMetrics, EnergyMetrics } from './types'
import {
  translateToRuntimeSignals,
  evaluateThreats,
  deriveEnergyMetrics,
  type ThreatEvalResult,
} from './translator'

export interface IngestResult {
  signals_translated: boolean
  threat_eval:        ThreatEvalResult
  energy:             EnergyMetrics
  events_published:   string[]
  errors:             string[]
}

export class RussianDollBridge {
  private readonly price_per_kwh: number
  private readonly carbon_intensity: number

  constructor(opts?: { price_per_kwh?: number; carbon_intensity_kg_per_kwh?: number }) {
    this.price_per_kwh   = opts?.price_per_kwh ?? 0.12
    this.carbon_intensity = opts?.carbon_intensity_kg_per_kwh ?? 0.386
  }

  /**
   * Ingest a Russian-Doll telemetry payload.
   * Translates, evaluates, and fans out to the event bus.
   * Returns a summary of what was published and any errors encountered.
   */
  async ingest(metrics: RussianDollJobMetrics): Promise<IngestResult> {
    const events_published: string[] = []
    const errors: string[] = []

    // 1. Translate to Tutela RuntimeSignals
    const signals = translateToRuntimeSignals(metrics)

    // 2. Evaluate for threats (lightweight local evaluator)
    const threat_eval = evaluateThreats(signals)

    // 3. Derive energy metrics
    const energy = deriveEnergyMetrics(metrics, this.price_per_kwh, this.carbon_intensity)

    const bus = getEventBus()

    // ── Publish: energy.consumed ───────────────────────────────────────────
    try {
      await bus.publish({
        type:      'energy.consumed',
        event_id:  `rdoll-energy-${metrics.job_id}-${Date.now()}`,
        timestamp: metrics.timestamp,
        source:    'russian-doll-bridge',
        job_id:    metrics.job_id,
        gpu_id:    metrics.gpu_id,
        region:    'unknown',  // Provider sets region; bridge doesn't know it
        kwh:       energy.kwh,
        cost_usd:  energy.cost_usd,
        energy_price_per_kwh: energy.price_per_kwh,
        carbon_kg_co2e:       energy.carbon_kg_co2e,
      } as Parameters<typeof bus.publish>[0])
      events_published.push('energy.consumed')
    } catch (err) {
      errors.push(`energy.consumed: ${String(err)}`)
    }

    // ── Publish: anomaly.detected (only when threat found) ─────────────────
    if (threat_eval.threat_detected) {
      try {
        await bus.publish({
          type:      'anomaly.detected',
          event_id:  `rdoll-anomaly-${metrics.job_id}-${Date.now()}`,
          timestamp: metrics.timestamp,
          source:    'russian-doll-bridge',
          job_id:    metrics.job_id,
          node_id:   metrics.node_id,
          gpu_id:    metrics.gpu_id,
          subject_id: metrics.subject_id,
          anomaly_type:        threat_eval.anomaly_types[0] ?? 'UNKNOWN',
          anomaly_types:       threat_eval.anomaly_types,
          severity:            threat_eval.severity,
          risk_score:          threat_eval.risk_score,
          recommended_action:  threat_eval.recommended_action,
          signal_snapshot:     signals,
          details:             threat_eval.details,
        } as Parameters<typeof bus.publish>[0])
        events_published.push('anomaly.detected')
      } catch (err) {
        errors.push(`anomaly.detected: ${String(err)}`)
      }
    }

    // ── Publish: job.completed (when Russian-Doll reports job done) ─────────
    // Russian-Doll reports completion when completion_percentage = 100
    const completion_pct = metrics.total_tasks_scheduled > 0
      ? (metrics.total_tasks_completed / metrics.total_tasks_scheduled) * 100
      : 0

    if (completion_pct >= 100) {
      try {
        await bus.publish({
          type:              'job.completed',
          event_id:          `rdoll-complete-${metrics.job_id}-${Date.now()}`,
          timestamp:         metrics.timestamp,
          source:            'russian-doll-bridge',
          job_id:            metrics.job_id,
          gpu_id:            metrics.gpu_id,
          subject_id:        metrics.subject_id,
          duration_hours:    metrics.elapsed_time_seconds / 3600,
          actual_cost_usd:   energy.cost_usd,
          energy_kwh:        energy.kwh,
          carbon_kg_co2e:    energy.carbon_kg_co2e,
          // Russian-Doll specific telemetry
          virtual_transistors:   BigInt(metrics.total_tasks_completed),
          energy_per_op_fj:      metrics.energy_per_task_fj,
        } as Parameters<typeof bus.publish>[0])
        events_published.push('job.completed')
      } catch (err) {
        errors.push(`job.completed: ${String(err)}`)
      }
    }

    return {
      signals_translated: true,
      threat_eval,
      energy,
      events_published,
      errors,
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _bridge: RussianDollBridge | null = null

export function getRussianDollBridge(opts?: {
  price_per_kwh?: number
  carbon_intensity_kg_per_kwh?: number
}): RussianDollBridge {
  if (!_bridge) _bridge = new RussianDollBridge(opts)
  return _bridge
}
