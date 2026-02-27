/**
 * CUSTODES TUTELA — Core Types
 * Runtime Protection, Threat Detection & Governance Engine
 *
 * Tutela is the immune system of the stack.
 * It watches every running job in real time and kills anything
 * that violates the rules — before damage is done.
 *
 * Three threat categories:
 *   RESOURCE ABUSE  — Power/VRAM/CPU beyond declared limits
 *   WORKLOAD FRAUD  — Job doing something other than declared
 *   SECURITY THREAT — Network attacks, data exfiltration, crypto mining
 *
 * Every anomaly Tutela catches becomes a detection rule.
 * The system gets smarter with every incident — the moat builds itself.
 *
 * University context: malicious behavior = academic consequences
 * Enterprise context: access revocation = existential (forces 3x cost cloud)
 */

// ─── Threat Classification ────────────────────────────────────────────────────

export enum ThreatCategory {
  RESOURCE_ABUSE    = 'RESOURCE_ABUSE',
  WORKLOAD_FRAUD    = 'WORKLOAD_FRAUD',
  NETWORK_ATTACK    = 'NETWORK_ATTACK',
  DATA_EXFILTRATION = 'DATA_EXFILTRATION',
  CRYPTO_MINING     = 'CRYPTO_MINING',
  BOTNET_ACTIVITY   = 'BOTNET_ACTIVITY',
  POWER_VIOLATION   = 'POWER_VIOLATION',
  SLA_VIOLATION     = 'SLA_VIOLATION',
  BENCHMARK_FRAUD   = 'BENCHMARK_FRAUD',
  POLICY_VIOLATION  = 'POLICY_VIOLATION',
  UNKNOWN           = 'UNKNOWN',
}

export enum ThreatSeverity {
  LOW      = 'LOW',      // Log and flag, no action
  MEDIUM   = 'MEDIUM',   // Throttle and warn
  HIGH     = 'HIGH',     // Kill job, suspend node
  CRITICAL = 'CRITICAL', // Kill job, ban subject, notify institution
}

export enum AnomalyType {
  // Power
  POWER_LIMIT_EXCEEDED        = 'POWER_LIMIT_EXCEEDED',
  SUSTAINED_HIGH_POWER        = 'SUSTAINED_HIGH_POWER',
  THERMAL_THROTTLE_SUSTAINED  = 'THERMAL_THROTTLE_SUSTAINED',

  // Memory
  VRAM_OVERCLAIM              = 'VRAM_OVERCLAIM',
  MEMORY_LEAK_DETECTED        = 'MEMORY_LEAK_DETECTED',

  // Network
  OUTBOUND_PORT_SCAN          = 'OUTBOUND_PORT_SCAN',
  ARP_SCAN_DETECTED           = 'ARP_SCAN_DETECTED',
  HIGH_OUTBOUND_BANDWIDTH     = 'HIGH_OUTBOUND_BANDWIDTH',
  DNS_TUNNELING               = 'DNS_TUNNELING',
  TOR_CONNECTION              = 'TOR_CONNECTION',
  CRYPTO_POOL_CONNECTION      = 'CRYPTO_POOL_CONNECTION',
  C2_BEACON_PATTERN           = 'C2_BEACON_PATTERN',

  // Process
  UNEXPECTED_BINARY_EXECUTION = 'UNEXPECTED_BINARY_EXECUTION',
  PRIVILEGE_ESCALATION_ATTEMPT= 'PRIVILEGE_ESCALATION_ATTEMPT',
  CONTAINER_ESCAPE_ATTEMPT    = 'CONTAINER_ESCAPE_ATTEMPT',
  KERNEL_MODULE_LOAD          = 'KERNEL_MODULE_LOAD',

  // Workload
  WORKLOAD_MISMATCH           = 'WORKLOAD_MISMATCH',
  CRYPTO_MINING_PATTERN       = 'CRYPTO_MINING_PATTERN',
  IDLE_GPU_WITH_HIGH_NETWORK  = 'IDLE_GPU_WITH_HIGH_NETWORK',
  BENCHMARK_MANIPULATION      = 'BENCHMARK_MANIPULATION',

  // Duration
  DURATION_LIMIT_EXCEEDED     = 'DURATION_LIMIT_EXCEEDED',
  HEARTBEAT_MISSING           = 'HEARTBEAT_MISSING',
}

// ─── Runtime Signal ───────────────────────────────────────────────────────────

/**
 * A bundle of signals from a running job.
 * Reported by the host agent every N seconds.
 * Tutela evaluates each signal bundle against detection rules.
 */
export interface RuntimeSignals {
  job_id: string
  node_id: string
  gpu_id: string
  subject_id: string
  timestamp: string               // ISO 8601

  // GPU signals
  gpu_utilization_pct: number
  vram_used_gb: number
  vram_allocated_gb: number       // What was authorized
  power_draw_watts: number
  power_cap_watts: number         // Hard limit from Aedituus
  temperature_c: number
  thermal_throttling: boolean

  // Network signals
  outbound_bytes_per_sec: number
  inbound_bytes_per_sec: number
  active_connections: number
  unique_dst_ips: number
  dns_queries_per_min: number
  suspicious_destinations: string[] // IPs/domains flagged by threat intel

  // Process signals
  process_count: number
  unexpected_processes: string[]  // Processes not in declared framework
  privilege_escalation_attempts: number
  filesystem_writes_per_sec: number

  // Workload signals
  declared_framework: string      // What the manifest said
  detected_framework?: string     // What we actually see (from nvidia-smi proc name)
  gpu_compute_pattern: ComputePattern
}

export enum ComputePattern {
  TRAINING       = 'TRAINING',     // High sustained GPU util, low network
  INFERENCE      = 'INFERENCE',    // Bursty GPU util, request/response pattern
  CRYPTO_MINING  = 'CRYPTO_MINING',// Sustained ~99% util, pool connections
  IDLE           = 'IDLE',         // Low util despite active job
  NETWORK_HEAVY  = 'NETWORK_HEAVY',// Low GPU util, high outbound bandwidth
  DATA_MOVEMENT  = 'DATA_MOVEMENT',// Moderate GPU, high I/O
  UNKNOWN        = 'UNKNOWN',
}

// ─── Detection Rule ───────────────────────────────────────────────────────────

/**
 * A single detection rule defining what constitutes an anomaly.
 * Rules are versioned — every incident that reveals a gap adds a new rule.
 */
export interface DetectionRule {
  rule_id: string
  rule_version: string
  anomaly_type: AnomalyType
  threat_category: ThreatCategory
  severity: ThreatSeverity
  description: string

  // Thresholds
  conditions: DetectionConditions

  // Response
  response: TutelaResponse

  // Metadata
  is_active: boolean
  created_from_incident?: string   // Incident ID that spawned this rule
  created_at: string
  updated_at: string
  false_positive_count: number     // Track to tune thresholds
}

export interface DetectionConditions {
  // Power
  power_draw_exceeds_cap_pct?: number      // e.g. 110 = 10% over cap triggers
  sustained_power_threshold_watts?: number
  sustained_power_duration_seconds?: number

  // VRAM
  vram_exceeds_allocation_pct?: number     // e.g. 120 = 20% over allocated

  // Network
  outbound_bytes_per_sec_threshold?: number
  unique_dst_ips_threshold?: number
  dns_queries_per_min_threshold?: number
  suspicious_destination_count?: number
  port_scan_threshold_ports?: number

  // Process
  unexpected_process_count?: number
  privilege_escalation_count?: number
  container_escape_signals?: boolean

  // Workload pattern
  mismatched_compute_pattern?: boolean     // Detected != declared
  crypto_pool_connection?: boolean
  gpu_util_with_high_network?: boolean     // Low GPU + high outbound = exfiltration

  // Duration
  exceeds_duration_limit_pct?: number      // e.g. 110 = 10% over limit
}

// ─── Tutela Response ──────────────────────────────────────────────────────────

export interface TutelaResponse {
  action: TutelaAction
  notify_subject: boolean
  notify_institution: boolean
  notify_platform_admin: boolean
  escalate_to_legal: boolean       // For CRITICAL threats
  cooldown_hours?: number          // If SUSPEND_NODE, how long
  ban_subject?: boolean
  evidence_collection: boolean     // Trigger Obsidian evidence package
}

export enum TutelaAction {
  LOG_ONLY         = 'LOG_ONLY',           // Record, no disruption
  THROTTLE         = 'THROTTLE',           // Reduce power/bandwidth
  WARN_SUBJECT     = 'WARN_SUBJECT',       // Notify and continue
  KILL_JOB         = 'KILL_JOB',           // Terminate job only
  KILL_AND_SUSPEND = 'KILL_AND_SUSPEND',   // Kill job + suspend node temporarily
  KILL_AND_BAN     = 'KILL_AND_BAN',       // Kill job + ban subject permanently
  EMERGENCY_HALT   = 'EMERGENCY_HALT',     // Kill everything on node immediately
}

// ─── Incident ────────────────────────────────────────────────────────────────

/**
 * A confirmed threat event — one or more anomalies that triggered a response.
 */
export interface TutelaIncident {
  incident_id: string
  job_id: string
  node_id: string
  gpu_id: string
  subject_id: string
  institution_id?: string

  threat_category: ThreatCategory
  severity: ThreatSeverity
  anomalies: AnomalyType[]
  triggered_rule_ids: string[]

  action_taken: TutelaAction
  response_at: string             // ISO 8601 — when action was executed

  // Evidence
  signal_snapshot: RuntimeSignals
  evidence_entry_ids: string[]    // Obsidian ledger entries

  // Resolution
  status: IncidentStatus
  resolved_at?: string
  resolution_notes?: string
  false_positive: boolean
  new_rule_created?: string       // Rule ID if incident spawned a new detection rule

  created_at: string
}

export enum IncidentStatus {
  ACTIVE    = 'ACTIVE',
  RESOLVED  = 'RESOLVED',
  ESCALATED = 'ESCALATED',
  FALSE_POSITIVE = 'FALSE_POSITIVE',
}

// ─── Risk Score ───────────────────────────────────────────────────────────────

/**
 * A per-job risk score computed by Tutela from runtime signals.
 * 0 = completely safe, 100 = kill immediately.
 * Aedituus reads this score to make dynamic access control decisions.
 */
export interface JobRiskScore {
  job_id: string
  subject_id: string
  score: number                   // 0–100
  score_breakdown: RiskScoreBreakdown
  computed_at: string
  signals_window_seconds: number  // How much signal history was used
}

export interface RiskScoreBreakdown {
  power_risk: number              // 0–100
  network_risk: number            // 0–100
  process_risk: number            // 0–100
  workload_risk: number           // 0–100
  duration_risk: number           // 0–100
}

// ─── Config ───────────────────────────────────────────────────────────────────

export interface TutelaConfig {
  instance_id: string
  signal_eval_interval_seconds: number    // How often to evaluate signals (default: 10)
  risk_score_window_seconds: number       // Signal history window for risk scoring (default: 300)
  power_grace_pct: number                 // % over cap before triggering (default: 5)
  network_baseline_bytes_per_sec: number  // Normal ML traffic ceiling (default: 10MB/s)
  crypto_pool_domains: string[]           // Known mining pool domains
  tor_exit_ips: string[]                  // Tor exit node list (update regularly)
  enable_emergency_halt: boolean          // Allow EMERGENCY_HALT action (default: true)
}

// ─── Store Interfaces ─────────────────────────────────────────────────────────

export interface TutelaRuleStore {
  getActiveRules(): Promise<DetectionRule[]>
  saveRule(rule: DetectionRule): Promise<void>
  updateRule(rule_id: string, update: Partial<DetectionRule>): Promise<void>
  incrementFalsePositive(rule_id: string): Promise<void>
  getRulesByAnomalyType(anomaly_type: AnomalyType): Promise<DetectionRule[]>
}

export interface TutelaIncidentStore {
  create(incident: TutelaIncident): Promise<void>
  update(incident_id: string, update: Partial<TutelaIncident>): Promise<void>
  findByJob(job_id: string): Promise<TutelaIncident[]>
  findBySubject(subject_id: string): Promise<TutelaIncident[]>
  findActive(): Promise<TutelaIncident[]>
  findByNode(node_id: string): Promise<TutelaIncident[]>
}

export interface TutelaRiskStore {
  saveRiskScore(score: JobRiskScore): Promise<void>
  getLatestRiskScore(job_id: string): Promise<JobRiskScore | null>
  getSignalHistory(job_id: string, window_seconds: number): Promise<RuntimeSignals[]>
  appendSignals(signals: RuntimeSignals): Promise<void>
}
