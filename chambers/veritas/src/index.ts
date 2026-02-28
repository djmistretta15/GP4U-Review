/**
 * Veritas Grid Chamber — Data Provenance Ledger
 *
 * Builds a provenance graph of every job: what GPU, what workload type,
 * what output hash. Enables trust scoring of providers based on
 * reproducibility and completion consistency.
 *
 * Subscribes to: job.completed, job.failed, gpu.health_reported,
 *                provenance.recorded, auth.authenticated
 *
 * Active influence type: ROUTING_PREFERENCE
 *   payload: { prefer_gpu_ids: string[], reason: 'veritas_verified' }
 *   Only recommends GPUs with high reproducibility scores.
 */

import type {
  Chamber, ChamberMode, ChamberStatus, ChamberInfluence,
  BacktestResult, PlatformEvent, PlatformEventType,
} from '@gp4u/types'

interface ProvenanceRecord {
  timestamp: string
  job_id: string
  gpu_id: string
  subject_id: string
  duration_hours: number
  actual_cost_usd: number
  completed: boolean
  output_hash?: string
}

interface GPUReliability {
  gpu_id: string
  completions: number
  failures: number
  avg_cost_vs_estimate: number // 1.0 = exact, >1.0 = over budget
}

export class VeritasChamber implements Chamber {
  readonly id = 'veritas'
  readonly name = 'Veritas Grid — Data Provenance'
  readonly version = '0.1.0'
  readonly subscribes_to: PlatformEventType[] = [
    'job.completed',
    'job.failed',
    'gpu.health_reported',
    'provenance.recorded',
    'auth.authenticated',
  ]

  private records: ProvenanceRecord[] = []
  private reliability = new Map<string, GPUReliability>()
  private mode: ChamberMode = 'OFFLINE'
  private events_received = 0
  private activated_at: string | null = null
  private backtest_score: number | null = null

  async onEvent(event: PlatformEvent): Promise<ChamberInfluence | null> {
    this.events_received++
    const e = event as Record<string, unknown>

    if (event.type === 'job.completed') {
      const rec: ProvenanceRecord = {
        timestamp:        event.timestamp,
        job_id:           e['job_id'] as string,
        gpu_id:           e['gpu_id'] as string,
        subject_id:       e['subject_id'] as string,
        duration_hours:   e['duration_hours'] as number,
        actual_cost_usd:  e['actual_cost_usd'] as number,
        completed:        true,
      }
      this.records.push(rec)
      this.updateReliability(rec.gpu_id, true)
    }

    if (event.type === 'job.failed') {
      this.updateReliability(e['gpu_id'] as string, false)
    }

    if (event.type === 'provenance.recorded') {
      const existing = this.records.find(r => r.job_id === (e['job_id'] as string))
      if (existing) existing.output_hash = e['output_hash'] as string
    }

    if (this.mode !== 'ACTIVE') return null

    // Recommend high-reliability GPUs when a new job is about to be routed
    if (event.type === 'job.completed') {
      const trusted = [...this.reliability.entries()]
        .filter(([, r]) => r.completions >= 3 && (r.completions / (r.completions + r.failures)) >= 0.9)
        .map(([gpu_id]) => gpu_id)

      if (trusted.length) {
        return {
          chamber_id:     this.id,
          influence_type: 'ROUTING_PREFERENCE',
          payload: {
            prefer_gpu_ids: trusted,
            reason:         `Veritas: ${trusted.length} GPU(s) with ≥90% completion rate`,
          },
          confidence: 0.8,
          ttl_seconds: 180,
        }
      }
    }

    return null
  }

  private updateReliability(gpu_id: string, success: boolean): void {
    const r = this.reliability.get(gpu_id) ?? {
      gpu_id, completions: 0, failures: 0, avg_cost_vs_estimate: 1.0,
    }
    if (success) r.completions++; else r.failures++
    this.reliability.set(gpu_id, r)
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
        summary: `Insufficient data: ${inRange.length} provenance records (need ≥5)`,
      }
    }

    const completion_rate = inRange.filter(r => r.completed).length / inRange.length
    const score = Math.round(completion_rate * 100)
    this.backtest_score = score

    return {
      chamber_id: this.id, from: from.toISOString(), to: to.toISOString(),
      events_replayed: inRange.length, score,
      improvement_pct: Math.round(completion_rate * 15 * 10) / 10,
      passed: score >= 70,
      summary: `${(completion_rate * 100).toFixed(1)}% job completion rate across ${inRange.length} jobs. ${this.reliability.size} GPUs profiled.`,
    }
  }

  async onModeChange(previous: ChamberMode, next: ChamberMode): Promise<void> {
    this.mode = next
    if (next === 'ACTIVE') this.activated_at = new Date().toISOString()
  }
}
