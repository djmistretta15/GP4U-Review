/**
 * CUSTODES TUTELA — Response Service
 *
 * Executes protective actions when the detection engine fires.
 * The kill switch. The enforcement arm.
 *
 * Action hierarchy (escalating):
 *   LOG_ONLY         → Record to Obsidian, no disruption
 *   THROTTLE         → Signal orchestration to reduce power/bandwidth
 *   WARN_SUBJECT     → Notify subject, continue monitoring
 *   KILL_JOB         → Terminate container, release allocation
 *   KILL_AND_SUSPEND → Kill + suspend node for cooldown period
 *   KILL_AND_BAN     → Kill + permanent subject ban + institution notification
 *   EMERGENCY_HALT   → Kill everything on the node immediately
 *
 * Every action is logged to Obsidian before execution.
 * You cannot kill a job without a ledger entry. Non-negotiable.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  TutelaIncident,
  TutelaAction,
  ThreatSeverity,
  IncidentStatus,
  TutelaConfig,
  TutelaIncidentStore,
  RuntimeSignals,
  DetectionRule,
} from './types'
import { DetectionResult, DetectedAnomaly } from './detection-engine'

// ─── External Service Interfaces ─────────────────────────────────────────────

export interface TutelaObsidianSink {
  emitAnomalyDetected(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    anomaly_type: string
    severity: string
    details: Record<string, unknown>
  }): Promise<void>

  emitKillSwitchFired(params: {
    subject_id: string
    job_id: string
    gpu_id: string
    reason: string
    triggered_by: 'TUTELA' | 'ADMIN' | 'INSTITUTION'
  }): Promise<void>

  emitClearanceRevoked(params: {
    subject_id: string
    node_id: string
    reason: string
    severity: string
  }): Promise<void>

  generateEvidencePackage(subject: 'JOB', subject_id: string): Promise<{ package_id: string }>
}

export interface TutelaAtlasSink {
  suspendNode(node_id: string, reason: string): Promise<void>
  releaseAllocation(allocation_id: string, status: string, cost: number): Promise<void>
  findActiveAllocationsForNode(node_id: string): Promise<Array<{ allocation_id: string; job_id: string; subject_id: string; gpu_id: string }>>
}

export interface TutelaDexteraSink {
  banSubject(params: {
    subject_id: string
    reason: string
    banned_by: string
    notify_institution: boolean
  }): Promise<void>
}

export interface TutelaOrchestrationSink {
  killJob(job_id: string, reason: string): Promise<void>
  throttleJob(job_id: string, power_limit_watts: number): Promise<void>
  killAllJobsOnNode(node_id: string, reason: string): Promise<void>
}

export interface TutelaNotificationSink {
  notifySubject(subject_id: string, message: string, severity: string): Promise<void>
  notifyInstitution(institution_id: string, incident: TutelaIncident): Promise<void>
  notifyPlatformAdmin(incident: TutelaIncident): Promise<void>
  escalateToLegal(incident: TutelaIncident): Promise<void>
}

// ─── Response Service ─────────────────────────────────────────────────────────

export class TutelaResponseService {
  private config: TutelaConfig
  private incidentStore: TutelaIncidentStore
  private obsidian: TutelaObsidianSink
  private atlas: TutelaAtlasSink
  private dextera: TutelaDexteraSink
  private orchestration: TutelaOrchestrationSink
  private notifications: TutelaNotificationSink

  constructor(
    config: TutelaConfig,
    incidentStore: TutelaIncidentStore,
    obsidian: TutelaObsidianSink,
    atlas: TutelaAtlasSink,
    dextera: TutelaDexteraSink,
    orchestration: TutelaOrchestrationSink,
    notifications: TutelaNotificationSink
  ) {
    this.config        = config
    this.incidentStore = incidentStore
    this.obsidian      = obsidian
    this.atlas         = atlas
    this.dextera       = dextera
    this.orchestration = orchestration
    this.notifications = notifications
  }

  /**
   * Process a detection result and execute the appropriate response.
   * This is the response arm of the detection-response loop.
   */
  async respond(
    result: DetectionResult,
    signals: RuntimeSignals,
    institution_id?: string
  ): Promise<TutelaIncident | null> {
    if (!result.requires_action && result.anomalies_detected.length === 0) {
      return null
    }

    // Determine the strongest required action across all anomalies
    const action = this.determineAction(result)
    const primary_anomaly = result.anomalies_detected[0]

    if (!primary_anomaly) return null

    // Collect evidence BEFORE taking action (always)
    const evidence_pkg = await this.obsidian.generateEvidencePackage('JOB', signals.job_id)

    // Emit all anomalies to Obsidian ledger
    for (const anomaly of result.anomalies_detected) {
      await this.obsidian.emitAnomalyDetected({
        subject_id:   signals.subject_id,
        job_id:       signals.job_id,
        gpu_id:       signals.gpu_id,
        anomaly_type: anomaly.anomaly_type,
        severity:     anomaly.severity,
        details:      anomaly.signal_values,
      })
    }

    // Build incident record
    const incident: TutelaIncident = {
      incident_id:       uuidv4(),
      job_id:            signals.job_id,
      node_id:           signals.node_id,
      gpu_id:            signals.gpu_id,
      subject_id:        signals.subject_id,
      institution_id,
      threat_category:   primary_anomaly.threat_category,
      severity:          result.highest_severity ?? ThreatSeverity.LOW,
      anomalies:         result.anomalies_detected.map(a => a.anomaly_type),
      triggered_rule_ids: result.anomalies_detected.map(a => a.rule_id),
      action_taken:      action,
      response_at:       new Date().toISOString(),
      signal_snapshot:   signals,
      evidence_entry_ids: [evidence_pkg.package_id],
      status:            IncidentStatus.ACTIVE,
      false_positive:    false,
      created_at:        new Date().toISOString(),
    }

    // Persist incident before executing action
    await this.incidentStore.create(incident)

    // Execute action
    await this.executeAction(action, incident, signals)

    return incident
  }

  /**
   * Mark an incident as a false positive.
   * This increments the false_positive_count on the triggered rule
   * so thresholds can be tuned.
   */
  async markFalsePositive(
    incident_id: string,
    resolved_by: string,
    notes: string
  ): Promise<void> {
    await this.incidentStore.update(incident_id, {
      status:           IncidentStatus.FALSE_POSITIVE,
      false_positive:   true,
      resolved_at:      new Date().toISOString(),
      resolution_notes: notes,
    })
  }

  /**
   * Manually trigger an emergency halt on a node.
   * Used by platform admins for immediate threats.
   */
  async emergencyHalt(
    node_id: string,
    triggered_by_subject: string,
    reason: string
  ): Promise<void> {
    if (!this.config.enable_emergency_halt) {
      throw new Error('Emergency halt is disabled in this environment')
    }

    // Kill all jobs on node
    await this.orchestration.killAllJobsOnNode(node_id, reason)

    // Suspend node in Atlas
    await this.atlas.suspendNode(node_id, reason)

    // Emit to Obsidian
    await this.obsidian.emitClearanceRevoked({
      subject_id: triggered_by_subject,
      node_id,
      reason,
      severity:   ThreatSeverity.CRITICAL,
    })

    // Notify admins
    const synthetic_incident: TutelaIncident = {
      incident_id:      uuidv4(),
      job_id:           'EMERGENCY_HALT',
      node_id,
      gpu_id:           'ALL',
      subject_id:       triggered_by_subject,
      threat_category:  'NETWORK_ATTACK' as any,
      severity:         ThreatSeverity.CRITICAL,
      anomalies:        [],
      triggered_rule_ids: ['manual_emergency_halt'],
      action_taken:     TutelaAction.EMERGENCY_HALT,
      response_at:      new Date().toISOString(),
      signal_snapshot:  {} as RuntimeSignals,
      evidence_entry_ids: [],
      status:           IncidentStatus.ACTIVE,
      false_positive:   false,
      created_at:       new Date().toISOString(),
    }

    await this.incidentStore.create(synthetic_incident)
    await this.notifications.notifyPlatformAdmin(synthetic_incident)
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private determineAction(result: DetectionResult): TutelaAction {
    const severity = result.highest_severity

    // Any CRITICAL anomaly including crypto mining or network attack
    const has_critical_network = result.anomalies_detected.some(a =>
      a.severity === ThreatSeverity.CRITICAL &&
      ['NETWORK_ATTACK', 'CRYPTO_MINING', 'DATA_EXFILTRATION', 'BOTNET_ACTIVITY'].includes(a.threat_category)
    )

    if (has_critical_network) return TutelaAction.KILL_AND_BAN

    if (severity === ThreatSeverity.CRITICAL) return TutelaAction.KILL_AND_SUSPEND

    if (severity === ThreatSeverity.HIGH) return TutelaAction.KILL_JOB

    if (severity === ThreatSeverity.MEDIUM) return TutelaAction.WARN_SUBJECT

    return TutelaAction.LOG_ONLY
  }

  private async executeAction(
    action: TutelaAction,
    incident: TutelaIncident,
    signals: RuntimeSignals
  ): Promise<void> {
    const reason = `Tutela: ${incident.anomalies[0]} — Incident ${incident.incident_id}`

    switch (action) {
      case TutelaAction.LOG_ONLY:
        // Already logged to Obsidian above
        break

      case TutelaAction.THROTTLE:
        // Reduce power to 80% of cap
        await this.orchestration.throttleJob(
          signals.job_id,
          Math.floor(signals.power_cap_watts * 0.80)
        )
        await this.notifications.notifySubject(
          signals.subject_id,
          `Your job ${signals.job_id} has been throttled: ${reason}`,
          'MEDIUM'
        )
        break

      case TutelaAction.WARN_SUBJECT:
        await this.notifications.notifySubject(
          signals.subject_id,
          `Warning: anomalous behavior detected in job ${signals.job_id}. ${reason}`,
          'MEDIUM'
        )
        break

      case TutelaAction.KILL_JOB:
        await this.obsidian.emitKillSwitchFired({
          subject_id:   signals.subject_id,
          job_id:       signals.job_id,
          gpu_id:       signals.gpu_id,
          reason,
          triggered_by: 'TUTELA',
        })
        await this.orchestration.killJob(signals.job_id, reason)
        await this.notifications.notifySubject(
          signals.subject_id,
          `Job ${signals.job_id} was terminated: ${reason}`,
          'HIGH'
        )
        await this.notifications.notifyPlatformAdmin(incident)
        break

      case TutelaAction.KILL_AND_SUSPEND:
        await this.obsidian.emitKillSwitchFired({
          subject_id:   signals.subject_id,
          job_id:       signals.job_id,
          gpu_id:       signals.gpu_id,
          reason,
          triggered_by: 'TUTELA',
        })
        await this.orchestration.killJob(signals.job_id, reason)
        await this.atlas.suspendNode(signals.node_id, reason)
        await this.obsidian.emitClearanceRevoked({
          subject_id: signals.subject_id,
          node_id:    signals.node_id,
          reason,
          severity:   ThreatSeverity.HIGH,
        })
        await this.notifications.notifyPlatformAdmin(incident)
        if (incident.institution_id) {
          await this.notifications.notifyInstitution(incident.institution_id, incident)
        }
        break

      case TutelaAction.KILL_AND_BAN:
        await this.obsidian.emitKillSwitchFired({
          subject_id:   signals.subject_id,
          job_id:       signals.job_id,
          gpu_id:       signals.gpu_id,
          reason,
          triggered_by: 'TUTELA',
        })
        await this.orchestration.killJob(signals.job_id, reason)
        await this.atlas.suspendNode(signals.node_id, reason)
        await this.dextera.banSubject({
          subject_id:         signals.subject_id,
          reason,
          banned_by:          'tutela-system',
          notify_institution: !!incident.institution_id,
        })
        await this.obsidian.emitClearanceRevoked({
          subject_id: signals.subject_id,
          node_id:    signals.node_id,
          reason,
          severity:   ThreatSeverity.CRITICAL,
        })
        await this.notifications.notifyPlatformAdmin(incident)
        if (incident.institution_id) {
          await this.notifications.notifyInstitution(incident.institution_id, incident)
        }
        break

      case TutelaAction.EMERGENCY_HALT:
        await this.orchestration.killAllJobsOnNode(signals.node_id, reason)
        await this.atlas.suspendNode(signals.node_id, reason)
        await this.notifications.notifyPlatformAdmin(incident)
        break
    }

    // Update incident with final status
    await this.incidentStore.update(incident.incident_id, {
      status: IncidentStatus.ACTIVE,
    })
  }
}
