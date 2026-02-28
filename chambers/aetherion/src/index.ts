/**
 * Aetherion Chamber — Network Latency Exchange
 *
 * Observes every network route calculation and job placement decision.
 * Builds a latency map of provider regions over time.
 * When active, influences Atlas routing toward lower-latency paths
 * and surfaces congestion warnings on the Aetherion UI.
 *
 * Subscribes to: network.route_calculated, job.created, job.completed,
 *                arbitrage.calculated, gpu.status_changed
 *
 * Active influence type: ROUTING_PREFERENCE
 *   payload: { preferred_regions: string[], avoid_regions: string[], reason: string }
 */

import type {
  Chamber, ChamberMode, ChamberStatus, ChamberInfluence,
  BacktestResult, PlatformEvent, PlatformEventType,
} from '@gp4u/types'

interface LatencyRecord {
  timestamp: string
  origin: string
  destination: string
  latency_ms: number
  bandwidth_gbps: number
  total_score: number
}

export class AetherionChamber implements Chamber {
  readonly id = 'aetherion'
  readonly name = 'Aetherion — Network Latency Exchange'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'network.route_calculated',
    'job.created',
    'job.completed',
    'arbitrage.calculated',
    'gpu.status_changed',
  ]

  private records: LatencyRecord[] = []
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++

    if (event.type === 'network.route_calculated') {
      const e = event as Record<string, unknown>
      this.records.push({
        timestamp:      event.timestamp,
        origin:         e['origin_node_id'] as string,
        destination:    e['destination_node_id'] as string,
        latency_ms:     e['latency_ms'] as number,
        bandwidth_gbps: e['bandwidth_gbps'] as number,
        total_score:    e['total_score'] as number,
      })
    }

    if (this.mode !== 'ACTIVE') return null

    // In ACTIVE mode: flag congested regions
    if (event.type === 'network.route_calculated') {
      const e = event as Record<string, unknown>
      const latency = e['latency_ms'] as number
      if (latency > 100) {
        return {
          chamber_id:     this.id,
          influence_type: 'ROUTING_PREFERENCE',
          payload: {
            avoid_regions: [e['destination_node_id']],
            reason:        `High latency detected: ${latency}ms > 100ms threshold`,
          },
          confidence: 0.75,
          ttl_seconds: 60,
        }
      }
    }

    return null
  }

  async getStatus(): Promise<ChamberStatus> {
    return {
      chamber_id:               this.id,
      name:                     this.name,
      mode:                     this.mode,
      events_received:          this.events_received,
      events_since_last_restart: this.events_received,
      health:                   this.records.length > 0 ? 'HEALTHY' : 'DEGRADED',
      last_event_at:            this.records.at(-1)?.timestamp ?? null,
      activated_at:             this.activated_at,
      backtest_score:           this.backtest_score,
    }
  }

  async runBacktest(from: Date, to: Date): Promise<BacktestResult> {
    const inRange = this.records.filter(r => {
      const t = new Date(r.timestamp)
      return t >= from && t <= to
    })

    if (inRange.length < 10) {
      return {
        chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
        events_replayed: inRange.length, score: 0, improvement_pct: 0, passed: false,
        summary: `Insufficient data: ${inRange.length} route records (need ≥10)`,
      }
    }

    const avg_latency = inRange.reduce((s, r) => s + r.latency_ms, 0) / inRange.length
    const high_latency = inRange.filter(r => r.latency_ms > 100).length
    const avoidance_rate = high_latency / inRange.length
    const score = Math.round(Math.min(100, avoidance_rate * 100 + 30))
    this.backtest_score = score

    return {
      chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
      events_replayed: inRange.length, score, improvement_pct: avoidance_rate * 15,
      passed: score >= 70,
      summary: `Avg latency ${avg_latency.toFixed(0)}ms. ${high_latency} high-latency routes detected.`,
    }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') this.activated_at = new Date().toISOString()
  }
}
