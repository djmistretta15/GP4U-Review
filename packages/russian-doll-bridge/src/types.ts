/**
 * @gp4u/russian-doll-bridge — Shared Types
 *
 * Defines the contract between Russian-Doll telemetry (from Python scheduler)
 * and the TypeScript platform bridge.
 *
 * Russian-Doll runs on provider hardware and emits job metrics periodically.
 * The bridge receives these metrics (via HTTP callback or WebSocket) and
 * translates them into:
 *   1. RuntimeSignals → Tutela threat detection
 *   2. AnomalyDetectedEvent → platform event bus → Obsidian ledger
 *   3. EnergyConsumedEvent → Energy Broker chamber
 *   4. Job telemetry update → Prisma (energy_kwh, carbon_kg_co2e, etc.)
 */

// ─── Russian-Doll Telemetry Payload ──────────────────────────────────────────
// Shape emitted by VirtualChipScheduler.get_metrics() + per-job metrics
// Arrives via POST /api/telemetry/russian-doll from the provider agent

export interface RussianDollJobMetrics {
  // Identity
  job_id:     string      // GP4U Job.id (injected at job creation time)
  node_id:    string      // Provider node identifier
  gpu_id:     string      // GP4U GPU.id
  subject_id: string      // GP4U User.id
  timestamp:  string      // ISO 8601

  // Scheduler metrics (from VirtualChipScheduler.get_metrics())
  total_dies:                number
  total_tasks_scheduled:     number
  total_tasks_completed:     number
  tasks_pending:             number
  tasks_active:              number
  total_energy_consumed_fj:  number  // femtojoules
  throughput_tasks_per_sec:  number
  energy_per_task_fj:        number
  elapsed_time_seconds:      number
  scheduler_policy:          string

  // Per-die utilization (keyed by die_id)
  die_utilization: Record<string, {
    total_cores:       number
    busy_cores:        number
    utilization_percent: number
  }>

  // GPU telemetry (from nvidia-smi / CUDA API on provider agent)
  gpu_utilization_pct:   number
  vram_used_gb:          number
  vram_allocated_gb:     number
  power_draw_watts:      number
  power_cap_watts:       number
  temperature_c:         number
  thermal_throttling:    boolean

  // Network telemetry (from provider network monitor)
  outbound_bytes_per_sec: number
  inbound_bytes_per_sec:  number
  active_connections:     number
  unique_dst_ips:         number
  dns_queries_per_min:    number
  suspicious_destinations: string[]

  // Process telemetry
  process_count:                    number
  unexpected_processes:             string[]
  privilege_escalation_attempts:    number
  filesystem_writes_per_sec:        number

  // Workload declaration (set at job creation, echoed back)
  declared_framework:    string
  detected_framework?:   string
  gpu_compute_pattern:   string  // TRAINING | INFERENCE | CRYPTO_MINING | IDLE | NETWORK_HEAVY | UNKNOWN
}

// ─── Tutela RuntimeSignals (mirrors custodes-tutela/src/types.ts) ─────────────
// Duplicated here to avoid a runtime dependency on the unzipped custodes package.
// Keep in sync if the Tutela types change.

export interface TutelaRuntimeSignals {
  job_id:      string
  node_id:     string
  gpu_id:      string
  subject_id:  string
  timestamp:   string

  gpu_utilization_pct:   number
  vram_used_gb:          number
  vram_allocated_gb:     number
  power_draw_watts:      number
  power_cap_watts:       number
  temperature_c:         number
  thermal_throttling:    boolean

  outbound_bytes_per_sec: number
  inbound_bytes_per_sec:  number
  active_connections:     number
  unique_dst_ips:         number
  dns_queries_per_min:    number
  suspicious_destinations: string[]

  process_count:                 number
  unexpected_processes:          string[]
  privilege_escalation_attempts: number
  filesystem_writes_per_sec:     number

  declared_framework:   string
  detected_framework?:  string
  gpu_compute_pattern:  string
}

// ─── Tutela Threat Evaluation Result ─────────────────────────────────────────

export interface ThreatEvalResult {
  threat_detected:   boolean
  anomaly_types:     string[]
  severity:          'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  recommended_action: string
  risk_score:        number  // 0–100
  details:           string
}

// ─── Energy Metrics ──────────────────────────────────────────────────────────

export interface EnergyMetrics {
  kwh:              number
  cost_usd:         number
  price_per_kwh:    number
  carbon_kg_co2e:   number
}
