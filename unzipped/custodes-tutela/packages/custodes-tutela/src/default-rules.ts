/**
 * CUSTODES TUTELA — Default Detection Rules
 *
 * The baseline threat library shipped with the platform.
 * Every incident that reveals a gap adds a new rule to this library.
 * That is the moat: the threat taxonomy grows with every attack.
 *
 * Rule versioning: every rule has a version string.
 * When a rule is tuned after a false positive, the version increments.
 * Obsidian stores which rule version triggered each incident.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  DetectionRule,
  AnomalyType,
  ThreatCategory,
  ThreatSeverity,
  TutelaAction,
} from './types'

const now    = new Date().toISOString()
const SYSTEM = 'system'

function rule(
  anomaly_type: AnomalyType,
  threat_category: ThreatCategory,
  severity: ThreatSeverity,
  description: string,
  action: TutelaAction,
  conditions: DetectionRule['conditions'],
  notify_institution = false,
  ban_subject = false
): DetectionRule {
  return {
    rule_id:           uuidv4(),
    rule_version:      '1.0.0',
    anomaly_type,
    threat_category,
    severity,
    description,
    conditions,
    response: {
      action,
      notify_subject:        severity !== ThreatSeverity.LOW,
      notify_institution,
      notify_platform_admin: severity === ThreatSeverity.HIGH || severity === ThreatSeverity.CRITICAL,
      escalate_to_legal:     severity === ThreatSeverity.CRITICAL && ban_subject,
      ban_subject,
      evidence_collection:   severity !== ThreatSeverity.LOW,
    },
    is_active:             true,
    created_at:            now,
    updated_at:            now,
    false_positive_count:  0,
  }
}

export function buildDefaultDetectionRules(): DetectionRule[] {
  return [

    // ── Power Violations ────────────────────────────────────────────────────

    rule(
      AnomalyType.POWER_LIMIT_EXCEEDED,
      ThreatCategory.POWER_VIOLATION,
      ThreatSeverity.HIGH,
      'GPU power draw exceeds authorized cap by more than 5%',
      TutelaAction.KILL_JOB,
      { power_draw_exceeds_cap_pct: 105 }
    ),

    rule(
      AnomalyType.SUSTAINED_HIGH_POWER,
      ThreatCategory.RESOURCE_ABUSE,
      ThreatSeverity.MEDIUM,
      'GPU sustained above 95% power for 5+ minutes — thermal risk to host hardware',
      TutelaAction.WARN_SUBJECT,
      {
        sustained_power_threshold_watts:  0,   // Relative — calculated at eval time
        sustained_power_duration_seconds: 300,
      }
    ),

    rule(
      AnomalyType.THERMAL_THROTTLE_SUSTAINED,
      ThreatCategory.RESOURCE_ABUSE,
      ThreatSeverity.MEDIUM,
      'GPU thermal throttling sustained — risk of hardware damage to host',
      TutelaAction.THROTTLE,
      {}
    ),

    // ── VRAM Violations ─────────────────────────────────────────────────────

    rule(
      AnomalyType.VRAM_OVERCLAIM,
      ThreatCategory.RESOURCE_ABUSE,
      ThreatSeverity.HIGH,
      'Job is using more VRAM than allocated — stealing from other jobs',
      TutelaAction.KILL_JOB,
      { vram_exceeds_allocation_pct: 120 }
    ),

    rule(
      AnomalyType.MEMORY_LEAK_DETECTED,
      ThreatCategory.RESOURCE_ABUSE,
      ThreatSeverity.MEDIUM,
      'VRAM usage continuously growing over 30 min window — likely memory leak',
      TutelaAction.WARN_SUBJECT,
      {}
    ),

    // ── Network Attacks ─────────────────────────────────────────────────────

    rule(
      AnomalyType.OUTBOUND_PORT_SCAN,
      ThreatCategory.NETWORK_ATTACK,
      ThreatSeverity.CRITICAL,
      'Outbound port scan detected — attacking other hosts from rented GPU',
      TutelaAction.KILL_AND_BAN,
      { unique_dst_ips_threshold: 50 },
      true,   // notify_institution
      true    // ban_subject
    ),

    rule(
      AnomalyType.ARP_SCAN_DETECTED,
      ThreatCategory.NETWORK_ATTACK,
      ThreatSeverity.CRITICAL,
      'ARP scanning detected — mapping local campus network from rented GPU',
      TutelaAction.KILL_AND_BAN,
      {},
      true,
      true
    ),

    // ── Crypto Mining ────────────────────────────────────────────────────────

    rule(
      AnomalyType.CRYPTO_POOL_CONNECTION,
      ThreatCategory.CRYPTO_MINING,
      ThreatSeverity.CRITICAL,
      'Connection to known crypto mining pool — job is mining cryptocurrency',
      TutelaAction.KILL_AND_BAN,
      { suspicious_destination_count: 1 },
      true,
      true
    ),

    rule(
      AnomalyType.CRYPTO_MINING_PATTERN,
      ThreatCategory.CRYPTO_MINING,
      ThreatSeverity.CRITICAL,
      'Crypto mining compute pattern: sustained ~100% GPU util with pool connections',
      TutelaAction.KILL_AND_BAN,
      {},
      true,
      true
    ),

    // ── Data Exfiltration ────────────────────────────────────────────────────

    rule(
      AnomalyType.IDLE_GPU_WITH_HIGH_NETWORK,
      ThreatCategory.DATA_EXFILTRATION,
      ThreatSeverity.HIGH,
      'Low GPU utilization with high outbound bandwidth — possible data exfiltration',
      TutelaAction.KILL_AND_SUSPEND,
      {
        outbound_bytes_per_sec_threshold: 50_000_000, // 50 MB/s
        gpu_util_with_high_network:       true,
      },
      true
    ),

    rule(
      AnomalyType.TOR_CONNECTION,
      ThreatCategory.DATA_EXFILTRATION,
      ThreatSeverity.HIGH,
      'Connection to Tor exit node — anonymizing outbound traffic',
      TutelaAction.KILL_AND_SUSPEND,
      {},
      true
    ),

    rule(
      AnomalyType.DNS_TUNNELING,
      ThreatCategory.DATA_EXFILTRATION,
      ThreatSeverity.HIGH,
      'Abnormally high DNS query rate — possible DNS tunneling for data exfiltration',
      TutelaAction.KILL_JOB,
      { dns_queries_per_min_threshold: 500 }
    ),

    // ── Workload Fraud ───────────────────────────────────────────────────────

    rule(
      AnomalyType.WORKLOAD_MISMATCH,
      ThreatCategory.WORKLOAD_FRAUD,
      ThreatSeverity.MEDIUM,
      'Detected workload framework does not match declared manifest',
      TutelaAction.WARN_SUBJECT,
      { mismatched_compute_pattern: true }
    ),

    rule(
      AnomalyType.UNEXPECTED_BINARY_EXECUTION,
      ThreatCategory.WORKLOAD_FRAUD,
      ThreatSeverity.HIGH,
      'Unexpected processes running inside container — not in declared workload manifest',
      TutelaAction.KILL_JOB,
      { unexpected_process_count: 1 }
    ),

    // ── Container Security ───────────────────────────────────────────────────

    rule(
      AnomalyType.PRIVILEGE_ESCALATION_ATTEMPT,
      ThreatCategory.NETWORK_ATTACK,
      ThreatSeverity.CRITICAL,
      'Privilege escalation attempt detected — trying to break out of container',
      TutelaAction.KILL_AND_SUSPEND,
      { privilege_escalation_count: 1 },
      true
    ),

    rule(
      AnomalyType.CONTAINER_ESCAPE_ATTEMPT,
      ThreatCategory.NETWORK_ATTACK,
      ThreatSeverity.CRITICAL,
      'Container escape attempt detected — trying to access host system',
      TutelaAction.EMERGENCY_HALT,
      { container_escape_signals: true },
      true,
      true
    ),

    rule(
      AnomalyType.KERNEL_MODULE_LOAD,
      ThreatCategory.NETWORK_ATTACK,
      ThreatSeverity.CRITICAL,
      'Kernel module load attempt from within container',
      TutelaAction.KILL_AND_SUSPEND,
      {},
      true
    ),

    // ── Benchmark Fraud ──────────────────────────────────────────────────────

    rule(
      AnomalyType.BENCHMARK_MANIPULATION,
      ThreatCategory.BENCHMARK_FRAUD,
      ThreatSeverity.HIGH,
      'GPU performance inconsistent with verified benchmark — hardware may be misrepresented',
      TutelaAction.KILL_JOB,
      {}
    ),

  ]
}
