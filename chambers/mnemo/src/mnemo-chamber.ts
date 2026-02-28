/**
 * Mnemo Chamber — Memory Broker
 *
 * Observes all memory and compute events flowing through GP4U.
 * Accumulates telemetry on VRAM/RAM demand and idle supply.
 * When activated, influences routing to prefer staked memory providers
 * and surfaces memory arbitrage opportunities to the marketplace.
 *
 * Lifecycle:
 *   PASSIVE  → Records every job.created, memory.staked, memory.allocated event
 *   BACKTEST → Replays history: "would staking have saved X%?"
 *   ACTIVE   → Emits ROUTING_PREFERENCE and MEMORY_SUGGESTION influences
 *
 * Ship analogy: Mnemo is the cargo manifest room. In PASSIVE mode it watches
 * what cargo goes where. Once it has enough data it can start routing cargo
 * to cheaper holds — but only after it proves the routing would have worked.
 */

import type {
  Chamber,
  ChamberMode,
  ChamberStatus,
  ChamberInfluence,
  BacktestResult,
  PlatformEvent,
  JobCreatedEvent,
  JobCompletedEvent,
  MemoryStakedEvent,
  MemoryAllocatedEvent,
  GPUHealthReportedEvent,
  PlatformEventType,
} from '@gp4u/types'
import { MnemoTelemetryStore } from './telemetry-store'

export class MnemoChamber implements Chamber {
  readonly id = 'mnemo'
  readonly name = 'Mnemo — Memory Broker'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'job.created',
    'job.completed',
    'memory.staked',
    'memory.allocated',
    'gpu.health_reported',
  ]

  private store = new MnemoTelemetryStore()
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private events_since_restart = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  // ─── Chamber Interface ───────────────────────────────────────────────────────

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++
    this.events_since_restart++

    switch (event.type) {
      case 'job.created':
        this.handleJobCreated(event as JobCreatedEvent)
        break
      case 'job.completed':
        this.handleJobCompleted(event as JobCompletedEvent)
        break
      case 'memory.staked':
        this.handleMemoryStaked(event as MemoryStakedEvent)
        break
      case 'memory.allocated':
        this.handleMemoryAllocated(event as MemoryAllocatedEvent)
        break
      case 'gpu.health_reported':
        this.handleHealthReported(event as GPUHealthReportedEvent)
        break
    }

    // Only return influence in ACTIVE mode
    if (this.mode !== 'ACTIVE') return null
    return this.computeInfluence(event)
  }

  async getStatus(): Promise<ChamberStatus> {
    return {
      chamber_id: this.id,
      name: this.name,
      mode: this.mode,
      events_received: this.events_received,
      events_since_last_restart: this.events_since_restart,
      health: this.store.total_events > 0 ? 'HEALTHY' : 'DEGRADED',
      last_event_at: this.store.last_event_at,
      activated_at: this.activated_at,
      backtest_score: this.backtest_score,
    }
  }

  async runBacktest(from: Date, to: Date): Promise<BacktestResult> {
    const demand = this.store.demandInRange(from, to)
    const supply = this.store.supplyInRange(from, to)
    const completions = this.store.completionsInRange(from, to)

    if (demand.length < 10) {
      return {
        chamber_id: this.id,
        from: from.toISOString(),
        to: to.toISOString(),
        events_replayed: demand.length,
        score: 0,
        improvement_pct: 0,
        passed: false,
        summary: `Insufficient data: only ${demand.length} demand records (need ≥10)`,
      }
    }

    const matched = this.store.matchDemandToSupply(demand, supply)
    const matchable = matched.filter(m => m.best_supply !== null)

    // Compute what jobs actually paid vs what staked memory would have cost
    let actual_cost = 0
    let staked_cost = 0
    let matched_count = 0

    for (const { demand: d, best_supply: s } of matched) {
      if (!s) continue
      actual_cost += d.estimated_cost_usd
      // Staked memory cost: price_per_gb_sec × vram × duration in seconds
      const duration_sec = d.estimated_duration_hours * 3600
      staked_cost += s.asking_price_per_gb_sec * d.vram_requested_gb * duration_sec
      matched_count++
    }

    const improvement_pct = actual_cost > 0
      ? ((actual_cost - staked_cost) / actual_cost) * 100
      : 0

    // Also factor in job completion efficiency
    const completion_rate = completions.length > 0
      ? completions.filter(c => c.actual_cost_usd > 0).length / completions.length
      : 1

    // Score: improvement × completion reliability, capped at 100
    const raw_score = Math.min(100, improvement_pct * completion_rate)
    const score = Math.max(0, Math.round(raw_score))

    this.backtest_score = score

    return {
      chamber_id: this.id,
      from: from.toISOString(),
      to: to.toISOString(),
      events_replayed: demand.length + supply.length + completions.length,
      score,
      improvement_pct: Math.round(improvement_pct * 100) / 100,
      passed: score >= 70,
      summary: `${matchable.length}/${demand.length} jobs could route to staked memory. ` +
        `Projected savings: ${improvement_pct.toFixed(1)}%. ` +
        `Job completion rate: ${(completion_rate * 100).toFixed(1)}%.`,
    }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') {
      this.activated_at = new Date().toISOString()
    }
    if (next === 'PASSIVE' || next === 'OFFLINE') {
      this.events_since_restart = 0
    }
  }

  // ─── Private: Event Handlers ─────────────────────────────────────────────────

  private handleJobCreated(event: JobCreatedEvent): void {
    this.store.demand.push({
      timestamp: event.timestamp,
      job_id: event.job_id,
      subject_id: event.subject_id,
      gpu_id: event.gpu_id,
      region: event.region,
      vram_requested_gb: event.vram_requested_gb,
      estimated_duration_hours: event.estimated_duration_hours,
      estimated_cost_usd: event.estimated_cost_usd,
      supply_tier: event.supply_tier,
    })
  }

  private handleJobCompleted(event: JobCompletedEvent): void {
    this.store.completions.push({
      timestamp: event.timestamp,
      job_id: event.job_id,
      gpu_id: event.gpu_id,
      duration_hours: event.duration_hours,
      actual_cost_usd: event.actual_cost_usd,
    })
  }

  private handleMemoryStaked(event: MemoryStakedEvent): void {
    this.store.supply.push({
      timestamp: event.timestamp,
      subject_id: event.subject_id,
      gpu_id: event.gpu_id,
      vram_gb: event.vram_gb,
      ram_gb: event.ram_gb,
      asking_price_per_gb_sec: event.asking_price_per_gb_sec,
      idle_schedule: event.idle_schedule,
    })
  }

  private handleMemoryAllocated(event: MemoryAllocatedEvent): void {
    this.store.allocations.push({
      timestamp: event.timestamp,
      allocation_id: event.allocation_id,
      buyer_subject_id: event.buyer_subject_id,
      provider_subject_id: event.provider_subject_id,
      gpu_id: event.gpu_id,
      vram_gb: event.vram_gb,
      ram_gb: event.ram_gb,
      price_per_gb_sec: event.price_per_gb_sec,
      duration_sec: event.duration_sec,
      total_cost_usd: event.total_cost_usd,
    })
  }

  private handleHealthReported(event: GPUHealthReportedEvent): void {
    // Tag GPUs with IDLE usage as latent supply candidates
    if (event.past_usage_tags.includes('IDLE')) {
      // Mark this GPU as an idle candidate — in a future version Mnemo
      // will suggest staking to providers who frequently show IDLE tags
      // For now just record in demand trends
    }
  }

  // ─── Private: Influence Computation ──────────────────────────────────────────

  private computeInfluence(event: PlatformEvent): ChamberInfluence | null {
    // When a new job arrives, check if we have staked supply that could serve it
    if (event.type !== 'job.created') return null

    const job = event as JobCreatedEvent
    const available_supply = this.store.supply.filter(
      s => s.vram_gb >= job.vram_requested_gb
    )

    if (!available_supply.length) return null

    const best = available_supply.reduce((a, b) =>
      a.asking_price_per_gb_sec < b.asking_price_per_gb_sec ? a : b
    )

    const duration_sec = job.estimated_duration_hours * 3600
    const staked_cost = best.asking_price_per_gb_sec * job.vram_requested_gb * duration_sec
    const savings_pct = job.estimated_cost_usd > 0
      ? ((job.estimated_cost_usd - staked_cost) / job.estimated_cost_usd) * 100
      : 0

    // Only suggest if meaningful savings exist
    if (savings_pct < 5) return null

    return {
      chamber_id: this.id,
      influence_type: 'MEMORY_SUGGESTION',
      payload: {
        job_id: job.job_id,
        suggested_gpu_id: best.gpu_id,
        suggested_provider_subject_id: best.subject_id,
        staked_vram_gb: best.vram_gb,
        price_per_gb_sec: best.asking_price_per_gb_sec,
        estimated_staked_cost_usd: staked_cost,
        estimated_savings_usd: job.estimated_cost_usd - staked_cost,
        savings_pct: Math.round(savings_pct * 10) / 10,
        reason: 'Idle staked VRAM available at lower cost than current routing',
      },
      confidence: Math.min(0.95, savings_pct / 100 + 0.5),
      ttl_seconds: 120, // suggestion valid for 2 minutes
    }
  }

  // ─── Public Stats ─────────────────────────────────────────────────────────────

  getStoreSnapshot() {
    return {
      demand_records: this.store.demand.length,
      supply_records: this.store.supply.length,
      allocation_records: this.store.allocations.length,
      completion_records: this.store.completions.length,
      total_demand_vram_gb: this.store.demand.reduce((s, r) => s + r.vram_requested_gb, 0),
      total_supply_vram_gb: this.store.supply.reduce((s, r) => s + r.vram_gb, 0),
    }
  }
}
