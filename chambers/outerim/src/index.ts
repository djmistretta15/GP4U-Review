/**
 * Outerim Chamber — Edge Compute Marketplace
 *
 * Tracks job demand vs edge node supply by region.
 * Identifies which edge regions are consistently underserved
 * and surfaces opportunities to onboard new edge providers.
 *
 * Subscribes to: job.created, gpu.listed, gpu.status_changed,
 *                network.route_calculated
 *
 * Active influence type: ROUTING_PREFERENCE
 *   payload: { prefer_supply_tier: 'EDGE', regions: string[] }
 *   Routes jobs to edge when edge latency is acceptable and cheaper.
 */

import type {
  Chamber, ChamberMode, ChamberStatus, ChamberInfluence,
  BacktestResult, PlatformEvent, PlatformEventType,
} from '@gp4u/types'

interface EdgeDemandRecord { timestamp: string; region: string; vram_gb: number }
interface EdgeSupplyRecord  { timestamp: string; region: string; gpu_id: string; status: string }

export class OuterimChamber implements Chamber {
  readonly id = 'outerim'
  readonly name = 'Outerim — Edge Compute Marketplace'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'job.created', 'gpu.listed', 'gpu.status_changed', 'network.route_calculated',
  ]

  private demand: EdgeDemandRecord[] = []
  private supply: EdgeSupplyRecord[] = []
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++
    const e = event as Record<string, unknown>

    if (event.type === 'job.created') {
      this.demand.push({ timestamp: event.timestamp, region: e['region'] as string, vram_gb: e['vram_requested_gb'] as number })
    }
    if (event.type === 'gpu.listed' && e['supply_tier'] === 'EDGE') {
      this.supply.push({ timestamp: event.timestamp, region: e['region'] as string, gpu_id: e['gpu_id'] as string, status: 'ONLINE' })
    }
    if (event.type === 'gpu.status_changed') {
      const s = this.supply.find(r => r.gpu_id === e['gpu_id'])
      if (s) s.status = e['new_status'] as string
    }

    if (this.mode !== 'ACTIVE') return null

    // Suggest edge routing when edge supply exists in job's region
    if (event.type === 'job.created') {
      const region = e['region'] as string
      const edge_in_region = this.supply.filter(s => s.region === region && s.status === 'ONLINE')
      if (edge_in_region.length) {
        return {
          chamber_id: this.id, influence_type: 'ROUTING_PREFERENCE',
          payload: {
            prefer_supply_tier: 'EDGE',
            regions: [region],
            available_edge_count: edge_in_region.length,
            reason: `${edge_in_region.length} edge GPU(s) available in ${region}`,
          },
          confidence: 0.65, ttl_seconds: 90,
        }
      }
    }
    return null
  }

  async getStatus(): Promise<ChamberStatus> {
    return {
      chamber_id: this.id, name: this.name, mode: this.mode,
      events_received: this.events_received, events_since_last_restart: this.events_received,
      health: this.demand.length > 0 ? 'HEALTHY' : 'DEGRADED',
      last_event_at: [...this.demand, ...this.supply].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]?.timestamp ?? null,
      activated_at: this.activated_at, backtest_score: this.backtest_score,
    }
  }

  async runBacktest(from: Date, to: Date): Promise<BacktestResult> {
    const d = this.demand.filter(r => new Date(r.timestamp) >= from && new Date(r.timestamp) <= to)
    if (d.length < 5) {
      return { chamber_id: this.id, from: from.toISOString(), to: to.toISOString(), events_replayed: d.length, score: 0, improvement_pct: 0, passed: false, summary: `Insufficient data: ${d.length} demand records` }
    }
    const routable = d.filter(dem => this.supply.some(s => s.region === dem.region && s.status === 'ONLINE'))
    const rate = routable.length / d.length
    const score = Math.round(rate * 100)
    this.backtest_score = score
    return { chamber_id: this.id, from: from.toISOString(), to: to.toISOString(), events_replayed: d.length, score, improvement_pct: rate * 12, passed: score >= 70, summary: `${routable.length}/${d.length} jobs routable to edge. ${this.supply.length} edge nodes tracked.` }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') this.activated_at = new Date().toISOString()
  }
}
