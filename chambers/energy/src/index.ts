/**
 * Energy Broker Chamber
 *
 * Tracks energy consumption per job, region, and provider.
 * Correlates GPU pricing with real energy costs.
 * When active, surfaces lower-carbon/lower-cost region alternatives.
 *
 * Subscribes to: energy.consumed, job.completed, arbitrage.calculated,
 *                gpu.health_reported
 *
 * Active influence type: ENERGY_ARBITRAGE
 *   payload: { preferred_region, avoided_region, cost_delta_usd, carbon_delta_kg }
 */

import type {
  Chamber, ChamberMode, ChamberStatus, ChamberInfluence,
  BacktestResult, PlatformEvent, PlatformEventType,
} from '@gp4u/types'

interface EnergyRecord {
  timestamp: string
  job_id: string
  gpu_id: string
  region: string
  kwh: number
  cost_usd: number
  price_per_kwh: number
  carbon_kg?: number
}

export class EnergyBrokerChamber implements Chamber {
  readonly id = 'energy'
  readonly name = 'Energy Broker'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'energy.consumed',
    'job.completed',
    'arbitrage.calculated',
    'gpu.health_reported',
  ]

  private records: EnergyRecord[] = []
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  // Region → avg price_per_kwh (built from telemetry)
  private regionPriceIndex = new Map<string, number[]>()

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++

    if (event.type === 'energy.consumed') {
      const e = event as Record<string, unknown>
      const region = e['region'] as string
      const price  = e['energy_price_per_kwh'] as number
      this.records.push({
        timestamp:     event.timestamp,
        job_id:        e['job_id'] as string,
        gpu_id:        e['gpu_id'] as string,
        region,
        kwh:           e['kwh'] as number,
        cost_usd:      e['cost_usd'] as number,
        price_per_kwh: price,
        carbon_kg:     e['carbon_kg_co2e'] as number | undefined,
      })

      // Update region index
      const list = this.regionPriceIndex.get(region) ?? []
      list.push(price)
      this.regionPriceIndex.set(region, list)
    }

    if (this.mode !== 'ACTIVE') return null
    return this.computeInfluence(event)
  }

  private computeInfluence(event: PlatformEvent): ChamberInfluence | null {
    if (event.type !== 'job.created') return null
    if (this.regionPriceIndex.size < 2) return null

    // Find cheapest energy region vs current
    const e = event as Record<string, unknown>
    const current_region = e['region'] as string
    const current_prices = this.regionPriceIndex.get(current_region)
    if (!current_prices?.length) return null

    const current_avg = current_prices.reduce((a, b) => a + b, 0) / current_prices.length

    let cheapest_region = current_region
    let cheapest_avg    = current_avg

    for (const [region, prices] of this.regionPriceIndex) {
      if (region === current_region) continue
      const avg = prices.reduce((a, b) => a + b, 0) / prices.length
      if (avg < cheapest_avg) { cheapest_avg = avg; cheapest_region = region }
    }

    if (cheapest_region === current_region) return null

    const savings_pct = ((current_avg - cheapest_avg) / current_avg) * 100
    if (savings_pct < 5) return null

    return {
      chamber_id:     this.id,
      influence_type: 'ENERGY_ARBITRAGE',
      payload: {
        current_region,
        preferred_region:     cheapest_region,
        current_price_per_kwh: current_avg,
        preferred_price_per_kwh: cheapest_avg,
        savings_pct:          Math.round(savings_pct * 10) / 10,
        reason: `Energy ${savings_pct.toFixed(1)}% cheaper in ${cheapest_region}`,
      },
      confidence: Math.min(0.9, savings_pct / 50 + 0.4),
      ttl_seconds: 300,
    }
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
      return {
        chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
        events_replayed: inRange.length, score: 0, improvement_pct: 0, passed: false,
        summary: `Insufficient data: ${inRange.length} energy records (need ≥5)`,
      }
    }

    const total_cost = inRange.reduce((s, r) => s + r.cost_usd, 0)
    const min_price  = Math.min(...[...this.regionPriceIndex.values()].map(ps => ps.reduce((a, b) => a + b, 0) / ps.length))
    const avg_price  = inRange.reduce((s, r) => s + r.price_per_kwh, 0) / inRange.length
    const improvement_pct = avg_price > 0 ? ((avg_price - min_price) / avg_price) * 100 : 0
    const score = Math.round(Math.min(100, improvement_pct * 3))
    this.backtest_score = score

    return {
      chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
      events_replayed: inRange.length, score, improvement_pct: Math.round(improvement_pct * 10) / 10,
      passed: score >= 70,
      summary: `$${total_cost.toFixed(2)} total energy cost. ${improvement_pct.toFixed(1)}% savings possible via region arbitrage.`,
    }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') this.activated_at = new Date().toISOString()
  }
}
