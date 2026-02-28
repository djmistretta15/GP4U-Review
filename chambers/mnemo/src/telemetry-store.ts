/**
 * Mnemo Chamber — Telemetry Store
 *
 * In-memory time-series of every memory-relevant event the chamber sees.
 * In PASSIVE mode this is the only thing Mnemo does: observe and record.
 *
 * In production, swap the in-memory arrays for a time-series DB
 * (TimescaleDB, InfluxDB, or even Postgres with partitioned tables).
 * The interface stays the same — the chamber never knows the difference.
 */

export interface VRAMDemandRecord {
  timestamp: string
  job_id: string
  subject_id: string
  gpu_id: string
  region: string
  vram_requested_gb: number
  estimated_duration_hours: number
  estimated_cost_usd: number
  supply_tier?: string
}

export interface VRAMSupplyRecord {
  timestamp: string
  subject_id: string
  gpu_id: string
  vram_gb: number
  ram_gb: number
  asking_price_per_gb_sec: number
  idle_schedule?: string
}

export interface MemoryAllocationRecord {
  timestamp: string
  allocation_id: string
  buyer_subject_id: string
  provider_subject_id: string
  gpu_id: string
  vram_gb: number
  ram_gb: number
  price_per_gb_sec: number
  duration_sec: number
  total_cost_usd: number
}

export interface CompletedJobRecord {
  timestamp: string
  job_id: string
  gpu_id: string
  duration_hours: number
  actual_cost_usd: number
  vram_used_gb?: number
}

export class MnemoTelemetryStore {
  readonly demand: VRAMDemandRecord[] = []
  readonly supply: VRAMSupplyRecord[] = []
  readonly allocations: MemoryAllocationRecord[] = []
  readonly completions: CompletedJobRecord[] = []

  get total_events(): number {
    return this.demand.length + this.supply.length +
           this.allocations.length + this.completions.length
  }

  get last_event_at(): string | null {
    const all = [
      this.demand.at(-1)?.timestamp,
      this.supply.at(-1)?.timestamp,
      this.allocations.at(-1)?.timestamp,
      this.completions.at(-1)?.timestamp,
    ].filter(Boolean) as string[]
    return all.length ? all.sort().at(-1)! : null
  }

  /** Demand records in a time range */
  demandInRange(from: Date, to: Date): VRAMDemandRecord[] {
    return this.demand.filter(r => {
      const t = new Date(r.timestamp)
      return t >= from && t <= to
    })
  }

  /** Supply records in a time range */
  supplyInRange(from: Date, to: Date): VRAMSupplyRecord[] {
    return this.supply.filter(r => {
      const t = new Date(r.timestamp)
      return t >= from && t <= to
    })
  }

  /** Completed jobs in a time range */
  completionsInRange(from: Date, to: Date): CompletedJobRecord[] {
    return this.completions.filter(r => {
      const t = new Date(r.timestamp)
      return t >= from && t <= to
    })
  }

  /**
   * For each demand record, find the cheapest supply record that could
   * have served it. Returns an array of [demand, best_supply | null].
   */
  matchDemandToSupply(
    demand: VRAMDemandRecord[],
    supply: VRAMSupplyRecord[]
  ): Array<{ demand: VRAMDemandRecord; best_supply: VRAMSupplyRecord | null }> {
    return demand.map(d => {
      const eligible = supply.filter(s => s.vram_gb >= d.vram_requested_gb)
      if (!eligible.length) return { demand: d, best_supply: null }
      const best = eligible.reduce((a, b) =>
        a.asking_price_per_gb_sec < b.asking_price_per_gb_sec ? a : b
      )
      return { demand: d, best_supply: best }
    })
  }
}
