/**
 * @gp4u/russian-doll-bridge — Metrics Translator
 *
 * Converts RussianDollJobMetrics → TutelaRuntimeSignals.
 *
 * The Russian-Doll scheduler uses femtojoule energy accounting,
 * compute patterns from CUDA profiling, and die-level utilization.
 * Tutela expects watts, bytes/sec, and process-level signals.
 *
 * This translator is the sole place where the two models meet —
 * a single file to audit if metrics semantics drift.
 */

import type {
  RussianDollJobMetrics,
  TutelaRuntimeSignals,
  EnergyMetrics,
} from './types'

// ─── Compute Pattern Normalization ────────────────────────────────────────────

// Russian-Doll may emit slightly different pattern strings than Tutela expects.
const PATTERN_MAP: Record<string, string> = {
  TRAINING:      'TRAINING',
  INFERENCE:     'INFERENCE',
  CRYPTO_MINING: 'CRYPTO_MINING',
  IDLE:          'IDLE',
  NETWORK_HEAVY: 'NETWORK_HEAVY',
  DATA_MOVEMENT: 'DATA_MOVEMENT',
  UNKNOWN:       'UNKNOWN',
}

function normalizeComputePattern(raw: string): string {
  return PATTERN_MAP[raw.toUpperCase()] ?? 'UNKNOWN'
}

// ─── Energy Conversion ────────────────────────────────────────────────────────

/**
 * Convert Russian-Doll femtojoule accounting to real-world energy metrics.
 *
 * Russian-Doll models idealized transistor-level energy. We scale by a
 * calibration factor that maps simulated fJ to real GPU power draw.
 * In production this factor would be measured empirically per GPU SKU.
 *
 * Formula:
 *   energy_kwh = power_draw_watts × elapsed_hours
 *   carbon     = energy_kwh × grid_carbon_intensity (US avg: 0.386 kg CO2e/kWh)
 *   cost_usd   = energy_kwh × price_per_kwh (default: $0.12/kWh)
 */
export function deriveEnergyMetrics(
  metrics: RussianDollJobMetrics,
  price_per_kwh = 0.12,
  carbon_intensity_kg_per_kwh = 0.386
): EnergyMetrics {
  const elapsed_hours = metrics.elapsed_time_seconds / 3600
  const kwh = metrics.power_draw_watts * elapsed_hours / 1000
  const cost_usd = kwh * price_per_kwh
  const carbon_kg_co2e = kwh * carbon_intensity_kg_per_kwh

  return { kwh, cost_usd, price_per_kwh, carbon_kg_co2e }
}

// ─── Main Translator ──────────────────────────────────────────────────────────

/**
 * Translate Russian-Doll job metrics → Tutela RuntimeSignals.
 *
 * Passes through all GPU/network/process signals directly.
 * Derives the compute_pattern from the raw GPU utilization when
 * Russian-Doll doesn't supply it (defensive fallback).
 */
export function translateToRuntimeSignals(
  metrics: RussianDollJobMetrics
): TutelaRuntimeSignals {
  // If Russian-Doll doesn't report a pattern, infer from GPU util + network
  let compute_pattern = normalizeComputePattern(metrics.gpu_compute_pattern)
  if (compute_pattern === 'UNKNOWN') {
    if (metrics.gpu_utilization_pct > 85 && metrics.outbound_bytes_per_sec < 10_000_000) {
      compute_pattern = 'TRAINING'
    } else if (metrics.gpu_utilization_pct < 20 && metrics.outbound_bytes_per_sec > 50_000_000) {
      compute_pattern = 'NETWORK_HEAVY'
    } else if (metrics.gpu_utilization_pct > 95 && metrics.unique_dst_ips > 5) {
      compute_pattern = 'CRYPTO_MINING'
    }
  }

  return {
    job_id:      metrics.job_id,
    node_id:     metrics.node_id,
    gpu_id:      metrics.gpu_id,
    subject_id:  metrics.subject_id,
    timestamp:   metrics.timestamp,

    // GPU
    gpu_utilization_pct:  metrics.gpu_utilization_pct,
    vram_used_gb:         metrics.vram_used_gb,
    vram_allocated_gb:    metrics.vram_allocated_gb,
    power_draw_watts:     metrics.power_draw_watts,
    power_cap_watts:      metrics.power_cap_watts,
    temperature_c:        metrics.temperature_c,
    thermal_throttling:   metrics.thermal_throttling,

    // Network
    outbound_bytes_per_sec:  metrics.outbound_bytes_per_sec,
    inbound_bytes_per_sec:   metrics.inbound_bytes_per_sec,
    active_connections:      metrics.active_connections,
    unique_dst_ips:          metrics.unique_dst_ips,
    dns_queries_per_min:     metrics.dns_queries_per_min,
    suspicious_destinations: metrics.suspicious_destinations,

    // Process
    process_count:                 metrics.process_count,
    unexpected_processes:          metrics.unexpected_processes,
    privilege_escalation_attempts: metrics.privilege_escalation_attempts,
    filesystem_writes_per_sec:     metrics.filesystem_writes_per_sec,

    // Workload
    declared_framework:  metrics.declared_framework,
    detected_framework:  metrics.detected_framework,
    gpu_compute_pattern: compute_pattern,
  }
}

// ─── Lightweight Threat Evaluator ─────────────────────────────────────────────
// A condensed version of Tutela's detection engine for use without the full
// Custodes package. Mirrors the rules in custodes-tutela/src/detection-engine.ts.
// When the full Tutela service is available, delegate to it instead.

export interface ThreatEvalResult {
  threat_detected:    boolean
  anomaly_types:      string[]
  severity:           'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommended_action: string
  risk_score:         number
  details:            string
}

export function evaluateThreats(signals: TutelaRuntimeSignals): ThreatEvalResult {
  const anomalies: string[] = []
  let max_severity: 0 | 1 | 2 | 3 = 0  // 0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL

  // ── Power ─────────────────────────────────────────────────────────────────
  if (signals.power_cap_watts > 0) {
    const over_pct = (signals.power_draw_watts / signals.power_cap_watts) * 100
    if (over_pct > 115) {
      anomalies.push('POWER_LIMIT_EXCEEDED')
      max_severity = Math.max(max_severity, 2) as typeof max_severity
    } else if (over_pct > 105) {
      anomalies.push('SUSTAINED_HIGH_POWER')
      max_severity = Math.max(max_severity, 1) as typeof max_severity
    }
  }
  if (signals.thermal_throttling) {
    anomalies.push('THERMAL_THROTTLE_SUSTAINED')
    max_severity = Math.max(max_severity, 1) as typeof max_severity
  }

  // ── VRAM ──────────────────────────────────────────────────────────────────
  if (signals.vram_allocated_gb > 0) {
    const vram_over = (signals.vram_used_gb / signals.vram_allocated_gb) * 100
    if (vram_over > 120) {
      anomalies.push('VRAM_OVERCLAIM')
      max_severity = Math.max(max_severity, 2) as typeof max_severity
    }
  }

  // ── Network ───────────────────────────────────────────────────────────────
  if (signals.outbound_bytes_per_sec > 100_000_000) {  // 100 MB/s
    anomalies.push('HIGH_OUTBOUND_BANDWIDTH')
    max_severity = Math.max(max_severity, 2) as typeof max_severity
  }
  if (signals.unique_dst_ips > 50) {
    anomalies.push('OUTBOUND_PORT_SCAN')
    max_severity = Math.max(max_severity, 3) as typeof max_severity
  }
  if (signals.dns_queries_per_min > 200) {
    anomalies.push('DNS_TUNNELING')
    max_severity = Math.max(max_severity, 2) as typeof max_severity
  }
  if (signals.suspicious_destinations.length > 0) {
    anomalies.push('CRYPTO_POOL_CONNECTION')
    max_severity = Math.max(max_severity, 3) as typeof max_severity
  }

  // ── Process ───────────────────────────────────────────────────────────────
  if (signals.unexpected_processes.length > 0) {
    anomalies.push('UNEXPECTED_BINARY_EXECUTION')
    max_severity = Math.max(max_severity, 2) as typeof max_severity
  }
  if (signals.privilege_escalation_attempts > 0) {
    anomalies.push('PRIVILEGE_ESCALATION_ATTEMPT')
    max_severity = Math.max(max_severity, 3) as typeof max_severity
  }

  // ── Workload ──────────────────────────────────────────────────────────────
  if (signals.gpu_compute_pattern === 'CRYPTO_MINING') {
    anomalies.push('CRYPTO_MINING_PATTERN')
    max_severity = Math.max(max_severity, 3) as typeof max_severity
  }
  if (signals.declared_framework && signals.detected_framework &&
      signals.declared_framework !== signals.detected_framework) {
    anomalies.push('WORKLOAD_MISMATCH')
    max_severity = Math.max(max_severity, 2) as typeof max_severity
  }
  if (signals.gpu_utilization_pct < 5 && signals.outbound_bytes_per_sec > 10_000_000) {
    anomalies.push('IDLE_GPU_WITH_HIGH_NETWORK')
    max_severity = Math.max(max_severity, 2) as typeof max_severity
  }

  const SEVERITY_LABELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
  const severity = SEVERITY_LABELS[max_severity]

  const ACTION_MAP: Record<string, string> = {
    LOW:      'LOG_ONLY',
    MEDIUM:   'THROTTLE',
    HIGH:     'KILL_JOB',
    CRITICAL: 'KILL_AND_BAN',
  }

  // Composite risk score: weighted sum of individual risk factors
  const power_risk    = signals.power_cap_watts > 0
    ? Math.min(100, ((signals.power_draw_watts / signals.power_cap_watts) - 1) * 200)
    : 0
  const network_risk  = Math.min(100, (signals.unique_dst_ips / 50) * 100)
  const process_risk  = Math.min(100, (signals.privilege_escalation_attempts * 50) +
                                      (signals.unexpected_processes.length * 20))
  const workload_risk = anomalies.includes('CRYPTO_MINING_PATTERN') ? 100
    : anomalies.includes('WORKLOAD_MISMATCH') ? 60
    : 0

  const risk_score = Math.round(
    Math.min(100,
      power_risk * 0.25 +
      network_risk * 0.35 +
      process_risk * 0.25 +
      workload_risk * 0.15
    )
  )

  return {
    threat_detected:    anomalies.length > 0,
    anomaly_types:      anomalies,
    severity,
    recommended_action: ACTION_MAP[severity] ?? 'LOG_ONLY',
    risk_score:         Math.max(0, risk_score),
    details: anomalies.length === 0
      ? 'No anomalies detected'
      : `${anomalies.length} anomaly type(s): ${anomalies.join(', ')}`,
  }
}
