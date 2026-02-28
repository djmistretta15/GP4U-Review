/**
 * Mist Chamber — Energy Arbitrage Strategy
 *
 * Correlates GPU compute pricing with energy cost data across providers.
 * Identifies when the same GPU type is priced differently across regions
 * due to underlying energy cost differences — pure arbitrage.
 *
 * Subscribes to: arbitrage.calculated, energy.consumed, job.completed
 *
 * Active influence type: PRICE_ADJUSTMENT
 *   payload: { gpu_type, recommended_provider, arbitrage_spread_usd, confidence }
 */

import type {
  Chamber, ChamberMode, ChamberStatus, ChamberInfluence,
  BacktestResult, PlatformEvent, PlatformEventType,
} from '@gp4u/types'

interface ArbitrageRecord {
  timestamp: string
  gpu_type: string
  best_provider: string
  potential_savings_usd: number
  result_count: number
}

export class MistChamber implements Chamber {
  readonly id = 'mist'
  readonly name = 'Mist Inc. — Energy Arbitrage'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'arbitrage.calculated', 'energy.consumed', 'job.completed',
  ]

  private records: ArbitrageRecord[] = []
  // gpu_type → { provider → [savings] }
  private savingsIndex = new Map<string, Map<string, number[]>>()
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++
    const e = event as Record<string, unknown>

    if (event.type === 'arbitrage.calculated') {
      const rec: ArbitrageRecord = {
        timestamp:             event.timestamp,
        gpu_type:              e['gpu_type'] as string,
        best_provider:         e['best_provider'] as string,
        potential_savings_usd: e['potential_savings_usd'] as number,
        result_count:          (e['results'] as unknown[])?.length ?? 0,
      }
      this.records.push(rec)

      // Update savings index per provider
      const byProvider = this.savingsIndex.get(rec.gpu_type) ?? new Map<string, number[]>()
      const list = byProvider.get(rec.best_provider) ?? []
      list.push(rec.potential_savings_usd)
      byProvider.set(rec.best_provider, list)
      this.savingsIndex.set(rec.gpu_type, byProvider)
    }

    if (this.mode !== 'ACTIVE') return null

    if (event.type === 'arbitrage.calculated') {
      const savings = e['potential_savings_usd'] as number
      if (savings > 5) {
        return {
          chamber_id:     this.id,
          influence_type: 'PRICE_ADJUSTMENT',
          payload: {
            gpu_type:         e['gpu_type'],
            best_provider:    e['best_provider'],
            savings_usd:      savings,
            reason:           `Mist: $${savings.toFixed(2)} arbitrage spread detected`,
          },
          confidence: Math.min(0.9, savings / 50 + 0.5),
          ttl_seconds: 120,
        }
      }
    }
    return null
  }

  async getStatus(): Promise<ChamberStatus> {
    return {
      chamber_id: this.id, name: this.name, mode: this.mode,
      events_received: this.events_received, events_since_last_restart: this.events_received,
      health: this.records.length > 0 ? 'HEALTHY' : 'DEGRADED',
      last_event_at: this.records.at(-1)?.timestamp ?? null,
      activated_at: this.activated_at, backtest_score: this.backtest_score,
    }
  }

  async runBacktest(from: Date, to: Date): Promise<BacktestResult> {
    const inRange = this.records.filter(r => new Date(r.timestamp) >= from && new Date(r.timestamp) <= to)
    if (inRange.length < 5) {
      return { chamber_id: this.id, from: from.toISOString(), to: to.toISOString(), events_replayed: inRange.length, score: 0, improvement_pct: 0, passed: false, summary: `Insufficient data: ${inRange.length} arbitrage records (need ≥5)` }
    }
    const total_savings = inRange.reduce((s, r) => s + r.potential_savings_usd, 0)
    const avg_savings   = total_savings / inRange.length
    const score = Math.round(Math.min(100, avg_savings * 10))
    this.backtest_score = score
    return {
      chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
      events_replayed: inRange.length, score, improvement_pct: avg_savings,
      passed: score >= 70,
      summary: `$${total_savings.toFixed(2)} total arbitrage spread across ${inRange.length} comparisons. Avg $${avg_savings.toFixed(2)}/comparison.`,
    }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') this.activated_at = new Date().toISOString()
  }
}
