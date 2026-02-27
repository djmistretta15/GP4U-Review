/**
 * CUSTODES TUTELA — Detection Engine
 *
 * Evaluates runtime signals against detection rules.
 * Every signal bundle gets checked against all active rules.
 * First HIGH/CRITICAL match triggers immediate response.
 * LOW/MEDIUM matches accumulate into a risk score.
 *
 * Design principle: cheap checks first, expensive last.
 * Power and VRAM checks are O(1). Network pattern analysis is O(n).
 * Process inspection is most expensive — only run when cheaper checks flag.
 */

import {
  RuntimeSignals,
  DetectionRule,
  DetectionConditions,
  AnomalyType,
  ThreatCategory,
  ThreatSeverity,
  ComputePattern,
  TutelaConfig,
  JobRiskScore,
  RiskScoreBreakdown,
  TutelaRuleStore,
  TutelaRiskStore,
} from './types'

// ─── Detection Result ─────────────────────────────────────────────────────────

export interface DetectionResult {
  job_id: string
  anomalies_detected: DetectedAnomaly[]
  risk_score: JobRiskScore
  requires_action: boolean
  highest_severity: ThreatSeverity | null
}

export interface DetectedAnomaly {
  rule_id: string
  anomaly_type: AnomalyType
  threat_category: ThreatCategory
  severity: ThreatSeverity
  details: string
  signal_values: Record<string, number | string | boolean>
}

// ─── Detection Engine ─────────────────────────────────────────────────────────

export class TutelaDetectionEngine {
  private config: TutelaConfig
  private ruleStore: TutelaRuleStore
  private riskStore: TutelaRiskStore
  private cachedRules: DetectionRule[] = []
  private rulesCachedAt = 0
  private RULE_CACHE_TTL_MS = 60_000 // Refresh rules every 60s

  constructor(config: TutelaConfig, ruleStore: TutelaRuleStore, riskStore: TutelaRiskStore) {
    this.config    = config
    this.ruleStore = ruleStore
    this.riskStore = riskStore
  }

  /**
   * Evaluate a signal bundle.
   * Called every N seconds for each running job.
   * Returns detected anomalies and current risk score.
   */
  async evaluate(signals: RuntimeSignals): Promise<DetectionResult> {
    // Persist signals for window-based analysis
    await this.riskStore.appendSignals(signals)

    // Load active rules (cached)
    const rules = await this.getActiveRules()

    // Run all detectors
    const anomalies: DetectedAnomaly[] = []

    // Tier 1: Cheap threshold checks (always run)
    anomalies.push(...this.checkPowerViolations(signals, rules))
    anomalies.push(...this.checkVRAMViolations(signals, rules))
    anomalies.push(...this.checkDurationViolations(signals, rules))

    // Tier 2: Network checks (run if anomalies found OR always for CAMPUS/EDGE)
    anomalies.push(...this.checkNetworkSignals(signals, rules))

    // Tier 3: Workload pattern checks
    anomalies.push(...this.checkWorkloadPattern(signals, rules))

    // Tier 4: Process checks (only if Tier 1-3 flagged something)
    if (anomalies.length > 0 || signals.unexpected_processes.length > 0) {
      anomalies.push(...this.checkProcessSignals(signals, rules))
    }

    // Compute risk score from signal history
    const history = await this.riskStore.getSignalHistory(
      signals.job_id,
      this.config.risk_score_window_seconds
    )
    const risk_score = this.computeRiskScore(signals, history)
    await this.riskStore.saveRiskScore(risk_score)

    const highest_severity = this.getHighestSeverity(anomalies)

    return {
      job_id:            signals.job_id,
      anomalies_detected: anomalies,
      risk_score,
      requires_action:   highest_severity !== null &&
                         highest_severity !== ThreatSeverity.LOW,
      highest_severity,
    }
  }

  // ─── Tier 1: Power & VRAM ─────────────────────────────────────────────────

  private checkPowerViolations(signals: RuntimeSignals, rules: DetectionRule[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = []
    const grace = 1 + (this.config.power_grace_pct / 100)

    // Immediate hard violation: power draw > cap * grace
    if (signals.power_draw_watts > signals.power_cap_watts * grace) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.POWER_LIMIT_EXCEEDED && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:        rule.rule_id,
          anomaly_type:   AnomalyType.POWER_LIMIT_EXCEEDED,
          threat_category: ThreatCategory.POWER_VIOLATION,
          severity:        rule.severity,
          details:        `Power draw ${signals.power_draw_watts}W exceeds cap ${signals.power_cap_watts}W`,
          signal_values: {
            power_draw_watts: signals.power_draw_watts,
            power_cap_watts:  signals.power_cap_watts,
            overage_pct:      Math.round((signals.power_draw_watts / signals.power_cap_watts - 1) * 100),
          },
        })
      }
    }

    // Thermal throttling sustained
    if (signals.thermal_throttling && signals.temperature_c > 85) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.THERMAL_THROTTLE_SUSTAINED && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.THERMAL_THROTTLE_SUSTAINED,
          threat_category: ThreatCategory.RESOURCE_ABUSE,
          severity:        rule.severity,
          details:         `GPU thermal throttling at ${signals.temperature_c}°C`,
          signal_values: {
            temperature_c:       signals.temperature_c,
            thermal_throttling:  true,
          },
        })
      }
    }

    return anomalies
  }

  private checkVRAMViolations(signals: RuntimeSignals, rules: DetectionRule[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = []

    if (signals.vram_allocated_gb > 0) {
      const vram_pct = (signals.vram_used_gb / signals.vram_allocated_gb) * 100
      if (vram_pct > 120) { // 20% over allocation
        const rule = rules.find(r => r.anomaly_type === AnomalyType.VRAM_OVERCLAIM && r.is_active)
        if (rule) {
          anomalies.push({
            rule_id:         rule.rule_id,
            anomaly_type:    AnomalyType.VRAM_OVERCLAIM,
            threat_category: ThreatCategory.RESOURCE_ABUSE,
            severity:        rule.severity,
            details:         `VRAM usage ${signals.vram_used_gb}GB exceeds allocation ${signals.vram_allocated_gb}GB`,
            signal_values: {
              vram_used_gb:      signals.vram_used_gb,
              vram_allocated_gb: signals.vram_allocated_gb,
              overclaim_pct:     Math.round(vram_pct - 100),
            },
          })
        }
      }
    }

    return anomalies
  }

  private checkDurationViolations(signals: RuntimeSignals, _rules: DetectionRule[]): DetectedAnomaly[] {
    // Duration violations are handled by Atlas watchdog + Tutela monitors together
    // Signal here is low — just track for risk score
    return []
  }

  // ─── Tier 2: Network ──────────────────────────────────────────────────────

  private checkNetworkSignals(signals: RuntimeSignals, rules: DetectionRule[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = []

    // Port scanning
    if (signals.unique_dst_ips > 50) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.OUTBOUND_PORT_SCAN && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.OUTBOUND_PORT_SCAN,
          threat_category: ThreatCategory.NETWORK_ATTACK,
          severity:        ThreatSeverity.CRITICAL,
          details:         `${signals.unique_dst_ips} unique destination IPs in single window — likely port scan`,
          signal_values: { unique_dst_ips: signals.unique_dst_ips },
        })
      }
    }

    // ARP scan detection
    if (signals.arp_scan_detected ?? false) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.ARP_SCAN_DETECTED && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.ARP_SCAN_DETECTED,
          threat_category: ThreatCategory.NETWORK_ATTACK,
          severity:        ThreatSeverity.CRITICAL,
          details:         'ARP scanning detected — attempting to map local network',
          signal_values:   { arp_scan: true },
        })
      }
    }

    // Crypto pool connections
    const crypto_connections = signals.suspicious_destinations.filter(d =>
      this.config.crypto_pool_domains.some(pool => d.includes(pool))
    )
    if (crypto_connections.length > 0) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.CRYPTO_POOL_CONNECTION && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.CRYPTO_POOL_CONNECTION,
          threat_category: ThreatCategory.CRYPTO_MINING,
          severity:        ThreatSeverity.CRITICAL,
          details:         `Connection to known crypto mining pool: ${crypto_connections[0]}`,
          signal_values: {
            pool_domains_matched: crypto_connections.length,
            first_match:          crypto_connections[0],
          },
        })
      }
    }

    // Tor exit connections
    const tor_connections = signals.suspicious_destinations.filter(d =>
      this.config.tor_exit_ips.includes(d)
    )
    if (tor_connections.length > 0) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.TOR_CONNECTION && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.TOR_CONNECTION,
          threat_category: ThreatCategory.DATA_EXFILTRATION,
          severity:        ThreatSeverity.HIGH,
          details:         'Connection to Tor exit node detected',
          signal_values:   { tor_ips_matched: tor_connections.length },
        })
      }
    }

    // High outbound bandwidth with low GPU util = exfiltration signature
    const baseline = this.config.network_baseline_bytes_per_sec
    if (
      signals.outbound_bytes_per_sec > baseline * 5 &&
      signals.gpu_utilization_pct < 20
    ) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.IDLE_GPU_WITH_HIGH_NETWORK && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.IDLE_GPU_WITH_HIGH_NETWORK,
          threat_category: ThreatCategory.DATA_EXFILTRATION,
          severity:        ThreatSeverity.HIGH,
          details:         `High outbound traffic (${Math.round(signals.outbound_bytes_per_sec / 1e6)}MB/s) with idle GPU (${signals.gpu_utilization_pct}%) — possible data exfiltration`,
          signal_values: {
            outbound_mbps:        signals.outbound_bytes_per_sec / 1e6,
            gpu_utilization_pct:  signals.gpu_utilization_pct,
          },
        })
      }
    }

    return anomalies
  }

  // ─── Tier 3: Workload Pattern ─────────────────────────────────────────────

  private checkWorkloadPattern(signals: RuntimeSignals, rules: DetectionRule[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = []

    // Crypto mining pattern: ~99% GPU util + crypto pool connections
    if (
      signals.gpu_compute_pattern === ComputePattern.CRYPTO_MINING ||
      (signals.gpu_utilization_pct > 95 &&
       signals.suspicious_destinations.some(d =>
         this.config.crypto_pool_domains.some(pool => d.includes(pool))
       ))
    ) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.CRYPTO_MINING_PATTERN && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.CRYPTO_MINING_PATTERN,
          threat_category: ThreatCategory.CRYPTO_MINING,
          severity:        ThreatSeverity.CRITICAL,
          details:         `Crypto mining pattern detected: ${signals.gpu_utilization_pct}% GPU util with mining pool connections`,
          signal_values: {
            gpu_utilization_pct:      signals.gpu_utilization_pct,
            compute_pattern:          signals.gpu_compute_pattern,
            declared_framework:       signals.declared_framework,
          },
        })
      }
    }

    // Workload mismatch
    if (
      signals.detected_framework &&
      signals.declared_framework &&
      !this.frameworksMatch(signals.declared_framework, signals.detected_framework)
    ) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.WORKLOAD_MISMATCH && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.WORKLOAD_MISMATCH,
          threat_category: ThreatCategory.WORKLOAD_FRAUD,
          severity:        ThreatSeverity.MEDIUM,
          details:         `Declared: ${signals.declared_framework}, Detected: ${signals.detected_framework}`,
          signal_values: {
            declared_framework: signals.declared_framework,
            detected_framework: signals.detected_framework,
          },
        })
      }
    }

    return anomalies
  }

  // ─── Tier 4: Process Signals ──────────────────────────────────────────────

  private checkProcessSignals(signals: RuntimeSignals, rules: DetectionRule[]): DetectedAnomaly[] {
    const anomalies: DetectedAnomaly[] = []

    if (signals.unexpected_processes.length > 0) {
      const rule = rules.find(r => r.anomaly_type === AnomalyType.UNEXPECTED_BINARY_EXECUTION && r.is_active)
      if (rule) {
        anomalies.push({
          rule_id:         rule.rule_id,
          anomaly_type:    AnomalyType.UNEXPECTED_BINARY_EXECUTION,
          threat_category: ThreatCategory.WORKLOAD_FRAUD,
          severity:        ThreatSeverity.HIGH,
          details:         `Unexpected processes: ${signals.unexpected_processes.slice(0, 3).join(', ')}`,
          signal_values: {
            unexpected_count:    signals.unexpected_processes.length,
            processes:           signals.unexpected_processes.join(','),
          },
        })
      }
    }

    if (signals.privilege_escalation_attempts > 0) {
      anomalies.push({
        rule_id:         'builtin_priv_esc',
        anomaly_type:    AnomalyType.PRIVILEGE_ESCALATION_ATTEMPT,
        threat_category: ThreatCategory.SECURITY_THREAT ?? ThreatCategory.NETWORK_ATTACK,
        severity:        ThreatSeverity.CRITICAL,
        details:         `${signals.privilege_escalation_attempts} privilege escalation attempt(s)`,
        signal_values:   { attempts: signals.privilege_escalation_attempts },
      })
    }

    return anomalies
  }

  // ─── Risk Score Computation ───────────────────────────────────────────────

  private computeRiskScore(
    current: RuntimeSignals,
    history: RuntimeSignals[]
  ): JobRiskScore {
    const all = [current, ...history]

    // Power risk: how close to cap over window?
    const avg_power_pct = avg(all.map(s =>
      s.power_cap_watts > 0 ? (s.power_draw_watts / s.power_cap_watts) * 100 : 0
    ))
    const power_risk = Math.min(100, Math.max(0, avg_power_pct - 80) * 5)

    // Network risk: outbound bandwidth + suspicious destinations
    const avg_outbound_mbps = avg(all.map(s => s.outbound_bytes_per_sec / 1e6))
    const baseline_mbps = this.config.network_baseline_bytes_per_sec / 1e6
    const network_risk = Math.min(100,
      (avg_outbound_mbps / baseline_mbps) * 20 +
      (current.suspicious_destinations.length * 15) +
      (current.unique_dst_ips > 10 ? current.unique_dst_ips * 2 : 0)
    )

    // Process risk
    const process_risk = Math.min(100,
      current.unexpected_processes.length * 20 +
      current.privilege_escalation_attempts * 50
    )

    // Workload risk: mismatch penalty
    const workload_risk = (
      current.detected_framework &&
      current.declared_framework &&
      !this.frameworksMatch(current.declared_framework, current.detected_framework)
    ) ? 40 : 0

    // Duration risk: if approaching limit
    const duration_risk = 0 // Computed by response service with actual timestamps

    const breakdown: RiskScoreBreakdown = {
      power_risk:    Math.round(power_risk),
      network_risk:  Math.round(network_risk),
      process_risk:  Math.round(process_risk),
      workload_risk: Math.round(workload_risk),
      duration_risk: Math.round(duration_risk),
    }

    const composite = Math.min(100, Math.round(
      power_risk * 0.25 +
      network_risk * 0.35 +
      process_risk * 0.25 +
      workload_risk * 0.15
    ))

    return {
      job_id:                  current.job_id,
      subject_id:              current.subject_id,
      score:                   composite,
      score_breakdown:         breakdown,
      computed_at:             new Date().toISOString(),
      signals_window_seconds:  this.config.risk_score_window_seconds,
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getActiveRules(): Promise<DetectionRule[]> {
    const now = Date.now()
    if (now - this.rulesCachedAt > this.RULE_CACHE_TTL_MS) {
      this.cachedRules  = await this.ruleStore.getActiveRules()
      this.rulesCachedAt = now
    }
    return this.cachedRules
  }

  private getHighestSeverity(anomalies: DetectedAnomaly[]): ThreatSeverity | null {
    const order = [ThreatSeverity.LOW, ThreatSeverity.MEDIUM, ThreatSeverity.HIGH, ThreatSeverity.CRITICAL]
    let highest: ThreatSeverity | null = null
    for (const a of anomalies) {
      if (!highest || order.indexOf(a.severity) > order.indexOf(highest)) {
        highest = a.severity
      }
    }
    return highest
  }

  private frameworksMatch(declared: string, detected: string): boolean {
    const normalize = (s: string) => s.toLowerCase().replace(/[-_\s]/g, '')
    const d = normalize(declared)
    const x = normalize(detected)
    // Allow partial matches (e.g. "pytorch" matches "torch")
    return d.includes(x) || x.includes(d) || d === x
  }
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}
