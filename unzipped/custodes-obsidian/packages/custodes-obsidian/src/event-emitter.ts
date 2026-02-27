/**
 * CUSTODES OBSIDIAN — Event Emitter
 *
 * A lightweight typed wrapper around the LedgerService.
 * All Custodes pillars and GP4U chambers use this to emit events —
 * they never call LedgerService.commit() directly.
 *
 * This ensures consistent event shapes across the entire stack
 * and makes each pillar's audit footprint explicit.
 *
 * Usage:
 *   import { ObsidianEmitter } from '@custodes/obsidian'
 *   await emitter.jobStarted({ job_id, subject_id, gpu_id, ... })
 */

import { ObsidianLedgerService } from './ledger-service'
import { LedgerEventType, LedgerEventSeverity } from './types'

export class ObsidianEmitter {
  constructor(private ledger: ObsidianLedgerService) {}

  // ─── Dextera Events ──────────────────────────────────────────────────────────

  async authSuccess(params: {
    subject_id: string
    passport_id: string
    institution_id?: string
    identity_provider: string
    trust_score: number
    ip_address: string
  }) {
    return this.ledger.commit({
      event_type:     LedgerEventType.AUTH_LOGIN,
      subject_id:     params.subject_id,
      passport_id:    params.passport_id,
      institution_id: params.institution_id,
      metadata: {
        identity_provider: params.identity_provider,
        trust_score:       params.trust_score,
      },
      ip_address: params.ip_address,
    })
  }

  async authFailed(params: {
    subject_id: string
    reason: string
    ip_address: string
    institution_id?: string
  }) {
    return this.ledger.commit({
      event_type: LedgerEventType.AUTH_FAILED,
      severity:   LedgerEventSeverity.WARN,
      subject_id: params.subject_id,
      metadata:   { reason: params.reason },
      ip_address: params.ip_address,
      institution_id: params.institution_id,
    })
  }

  async subjectBanned(params: {
    subject_id: string
    banned_by: string
    reason: string
    institution_id?: string
    notify_institution: boolean
  }) {
    return this.ledger.commit({
      event_type:     LedgerEventType.SUBJECT_BANNED,
      severity:       LedgerEventSeverity.SECURITY,
      subject_id:     params.subject_id,
      institution_id: params.institution_id,
      metadata: {
        banned_by:          params.banned_by,
        reason:             params.reason,
        notify_institution: params.notify_institution,
      },
      ip_address: 'system',
    })
  }

  // ─── Atlas Events (Resource) ─────────────────────────────────────────────────

  async gpuRegistered(params: {
    subject_id: string       // Host who registered
    gpu_id: string
    gpu_name: string
    vram_gb: number
    campus_id?: string
    ip_address: string
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.GPU_REGISTERED,
      subject_id:  params.subject_id,
      target_id:   params.gpu_id,
      target_type: 'GPU',
      metadata: {
        gpu_name:  params.gpu_name,
        vram_gb:   params.vram_gb,
        campus_id: params.campus_id,
      },
      ip_address: params.ip_address,
    })
  }

  async allocationCreated(params: {
    subject_id: string
    gpu_id: string
    job_id: string
    vram_allocated_gb: number
    power_cap_watts: number
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.ALLOCATION_CREATED,
      subject_id:  params.subject_id,
      target_id:   params.gpu_id,
      target_type: 'GPU',
      metadata: {
        job_id:             params.job_id,
        vram_allocated_gb:  params.vram_allocated_gb,
        power_cap_watts:    params.power_cap_watts,
      },
      ip_address: 'system',
    })
  }

  // ─── GP4U Job Events ─────────────────────────────────────────────────────────

  async jobSubmitted(params: {
    subject_id: string
    passport_id: string
    job_id: string
    gpu_id: string
    workload_type: string
    estimated_hours: number
    cost_estimate: number
    institution_id?: string
    ip_address: string
  }) {
    return this.ledger.commit({
      event_type:     LedgerEventType.JOB_SUBMITTED,
      subject_id:     params.subject_id,
      passport_id:    params.passport_id,
      institution_id: params.institution_id,
      target_id:      params.job_id,
      target_type:    'JOB',
      metadata: {
        gpu_id:           params.gpu_id,
        workload_type:    params.workload_type,
        estimated_hours:  params.estimated_hours,
        cost_estimate:    params.cost_estimate,
      },
      ip_address: params.ip_address,
    })
  }

  async jobStarted(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    container_id: string
    power_cap_watts: number
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.JOB_STARTED,
      subject_id:  params.subject_id,
      target_id:   params.job_id,
      target_type: 'JOB',
      metadata: {
        gpu_id:          params.gpu_id,
        container_id:    params.container_id,
        power_cap_watts: params.power_cap_watts,
        started_at:      new Date().toISOString(),
      },
      ip_address: 'system',
    })
  }

  async jobCompleted(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    duration_seconds: number
    power_consumed_wh: number
    final_cost: number
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.JOB_COMPLETED,
      subject_id:  params.subject_id,
      target_id:   params.job_id,
      target_type: 'JOB',
      metadata: {
        gpu_id:            params.gpu_id,
        duration_seconds:  params.duration_seconds,
        power_consumed_wh: params.power_consumed_wh,
        final_cost:        params.final_cost,
        completed_at:      new Date().toISOString(),
      },
      ip_address: 'system',
    })
  }

  async jobFailed(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    reason: string
    fault: 'HOST' | 'TENANT' | 'PLATFORM' | 'UNKNOWN'
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.JOB_FAILED,
      severity:    LedgerEventSeverity.WARN,
      subject_id:  params.subject_id,
      target_id:   params.job_id,
      target_type: 'JOB',
      metadata: {
        gpu_id:    params.gpu_id,
        reason:    params.reason,
        fault:     params.fault,
        failed_at: new Date().toISOString(),
      },
      ip_address: 'system',
    })
  }

  // ─── Tutela Events (Security) ────────────────────────────────────────────────

  async anomalyDetected(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    anomaly_type: string
    severity: LedgerEventSeverity
    details: Record<string, unknown>
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.ANOMALY_DETECTED,
      severity:    params.severity,
      subject_id:  params.subject_id,
      target_id:   params.job_id,
      target_type: 'JOB',
      metadata: {
        gpu_id:       params.gpu_id,
        anomaly_type: params.anomaly_type,
        ...params.details,
      },
      ip_address: 'system',
    })
  }

  async killSwitchFired(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    reason: string
    triggered_by: 'TUTELA' | 'ADMIN' | 'INSTITUTION'
  }) {
    return this.ledger.commit({
      event_type:  LedgerEventType.KILL_SWITCH_FIRED,
      severity:    LedgerEventSeverity.SECURITY,
      subject_id:  params.subject_id,
      target_id:   params.job_id,
      target_type: 'JOB',
      metadata: {
        gpu_id:       params.gpu_id,
        reason:       params.reason,
        triggered_by: params.triggered_by,
        fired_at:     new Date().toISOString(),
      },
      ip_address: 'system',
    })
  }

  // ─── Veritas Events (Benchmarking) ───────────────────────────────────────────

  async benchmarkRun(params: {
    subject_id: string
    gpu_id: string
    declared_vram_gb: number
    measured_vram_gb: number
    performance_score: number
    passed: boolean
  }) {
    return this.ledger.commit({
      event_type:  params.passed ? LedgerEventType.BENCHMARK_RUN : LedgerEventType.BENCHMARK_FAILED,
      severity:    params.passed ? LedgerEventSeverity.INFO : LedgerEventSeverity.WARN,
      subject_id:  params.subject_id,
      target_id:   params.gpu_id,
      target_type: 'GPU',
      metadata: {
        declared_vram_gb:  params.declared_vram_gb,
        measured_vram_gb:  params.measured_vram_gb,
        performance_score: params.performance_score,
        passed:            params.passed,
        delta_vram_gb:     params.declared_vram_gb - params.measured_vram_gb,
      },
      ip_address: 'system',
    })
  }
}
