/**
 * CUSTODES TUTELA — Main Service
 *
 * Top-level orchestrator combining detection + response.
 * This is the single entry point for:
 *   1. Processing runtime signal bundles from host agents
 *   2. Querying current risk scores (consumed by Aedituus)
 *   3. Manual admin actions (emergency halt, incident review)
 *   4. Rule management (add, tune, disable rules)
 *
 * The evaluation loop runs on a cron — every N seconds
 * per active job, signal bundles are evaluated and acted on.
 */

import {
  RuntimeSignals,
  TutelaIncident,
  TutelaConfig,
  JobRiskScore,
  DetectionRule,
  AnomalyType,
  IncidentStatus,
  TutelaRuleStore,
  TutelaIncidentStore,
  TutelaRiskStore,
} from './types'
import { TutelaDetectionEngine } from './detection-engine'
import {
  TutelaResponseService,
  TutelaObsidianSink,
  TutelaAtlasSink,
  TutelaDexteraSink,
  TutelaOrchestrationSink,
  TutelaNotificationSink,
} from './response-service'
import { buildDefaultDetectionRules } from './default-rules'
import { v4 as uuidv4 } from 'uuid'

export class TutelaService {
  private config: TutelaConfig
  private detector: TutelaDetectionEngine
  private responder: TutelaResponseService
  private ruleStore: TutelaRuleStore
  private incidentStore: TutelaIncidentStore
  private riskStore: TutelaRiskStore

  constructor(
    config: TutelaConfig,
    ruleStore: TutelaRuleStore,
    incidentStore: TutelaIncidentStore,
    riskStore: TutelaRiskStore,
    obsidian: TutelaObsidianSink,
    atlas: TutelaAtlasSink,
    dextera: TutelaDexteraSink,
    orchestration: TutelaOrchestrationSink,
    notifications: TutelaNotificationSink
  ) {
    this.config        = config
    this.ruleStore     = ruleStore
    this.incidentStore = incidentStore
    this.riskStore     = riskStore

    this.detector = new TutelaDetectionEngine(config, ruleStore, riskStore)
    this.responder = new TutelaResponseService(
      config, incidentStore, obsidian, atlas, dextera, orchestration, notifications
    )
  }

  /**
   * Primary evaluation method.
   * Called by the host agent signal processor every N seconds per job.
   *
   * Returns the incident if action was taken, null if clean.
   */
  async evaluateSignals(
    signals: RuntimeSignals,
    institution_id?: string
  ): Promise<{
    incident: TutelaIncident | null
    risk_score: JobRiskScore
    action_taken: boolean
  }> {
    const result = await this.detector.evaluate(signals)
    const incident = await this.responder.respond(result, signals, institution_id)

    return {
      incident,
      risk_score:   result.risk_score,
      action_taken: incident !== null,
    }
  }

  /**
   * Get the current risk score for a job.
   * Called by Aedituus before making access control decisions.
   * Low score = safe. High score = block or step-up.
   */
  async getRiskScore(job_id: string): Promise<JobRiskScore | null> {
    return this.riskStore.getLatestRiskScore(job_id)
  }

  /**
   * Get all active incidents.
   * Used by platform admin dashboard.
   */
  async getActiveIncidents(): Promise<TutelaIncident[]> {
    return this.incidentStore.findActive()
  }

  /**
   * Get all incidents for a specific job.
   * Used by dispute resolution in Obsidian.
   */
  async getIncidentsForJob(job_id: string): Promise<TutelaIncident[]> {
    return this.incidentStore.findByJob(job_id)
  }

  /**
   * Mark an incident as a false positive.
   * Increments false_positive_count on the triggered rules
   * so thresholds can be tuned without code changes.
   */
  async markFalsePositive(
    incident_id: string,
    resolved_by: string,
    notes: string
  ): Promise<void> {
    await this.responder.markFalsePositive(incident_id, resolved_by, notes)

    // Increment false positive counters on triggered rules
    const incident = await this.incidentStore.findByJob(incident_id)
    if (incident[0]) {
      for (const rule_id of incident[0].triggered_rule_ids) {
        await this.ruleStore.incrementFalsePositive(rule_id)
      }
    }
  }

  /**
   * Trigger an emergency halt on a node.
   * Kills all jobs, suspends node, notifies admins.
   */
  async emergencyHalt(
    node_id: string,
    triggered_by: string,
    reason: string
  ): Promise<void> {
    return this.responder.emergencyHalt(node_id, triggered_by, reason)
  }

  /**
   * Add a new detection rule.
   * Used when an incident reveals a gap in the existing ruleset.
   * This is the "incident loop" that builds the moat.
   */
  async addDetectionRule(
    rule: Omit<DetectionRule, 'rule_id' | 'created_at' | 'updated_at' | 'false_positive_count'>,
    created_from_incident?: string
  ): Promise<DetectionRule> {
    const full_rule: DetectionRule = {
      ...rule,
      rule_id:               uuidv4(),
      created_at:            new Date().toISOString(),
      updated_at:            new Date().toISOString(),
      false_positive_count:  0,
      created_from_incident,
    }
    await this.ruleStore.saveRule(full_rule)
    return full_rule
  }

  /**
   * Tune a rule's threshold (e.g. after false positives).
   * Increments version string and updates the rule.
   */
  async tuneRule(
    rule_id: string,
    updates: Partial<Pick<DetectionRule, 'conditions' | 'severity' | 'response' | 'is_active'>>,
    tuned_by: string
  ): Promise<void> {
    const existing = await this.ruleStore.getRulesByAnomalyType(
      // We need the rule — store should have a findById
      '' as AnomalyType
    )
    const rule = existing.find(r => r.rule_id === rule_id)
    if (!rule) throw new Error(`Rule not found: ${rule_id}`)

    // Increment version
    const [major, minor, patch] = rule.rule_version.split('.').map(Number)
    const new_version = `${major}.${minor}.${patch + 1}`

    await this.ruleStore.updateRule(rule_id, {
      ...updates,
      rule_version: new_version,
      updated_at:   new Date().toISOString(),
    })
  }

  /**
   * Seed default rules on platform startup.
   * Safe to call multiple times — checks for existing rules first.
   */
  async seedDefaultRules(): Promise<{ seeded: number }> {
    const defaults = buildDefaultDetectionRules()
    let seeded = 0

    for (const rule of defaults) {
      // Check if a rule of this anomaly_type already exists
      const existing = await this.ruleStore.getRulesByAnomalyType(rule.anomaly_type)
      if (existing.length === 0) {
        await this.ruleStore.saveRule(rule)
        seeded++
      }
    }

    return { seeded }
  }
}
