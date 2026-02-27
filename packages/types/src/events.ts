/**
 * @gp4u/types — Platform Event Definitions
 *
 * Every event that flows through the GP4U event bus is typed here.
 * This is the contract between GP4U core, Custodes, and all Chambers.
 *
 * Naming convention: DOMAIN.ACTION
 * Payload: always includes timestamp and a correlation_id for tracing
 */

// ─── Base ─────────────────────────────────────────────────────────────────────

export interface BaseEvent {
  event_id: string
  correlation_id: string   // Trace a user action across all modules
  timestamp: string        // ISO 8601
  source: string           // e.g. "gp4u.web", "custodes.atlas", "chamber.mnemo"
}

// ─── Auth / Identity Events (Dextera) ─────────────────────────────────────────

export interface UserRegisteredEvent extends BaseEvent {
  type: 'auth.user_registered'
  subject_id: string
  email: string
  identity_provider: string
}

export interface UserAuthenticatedEvent extends BaseEvent {
  type: 'auth.authenticated'
  subject_id: string
  passport_id: string
  clearance_level: number
  trust_score: number
  ip_address_hash: string
}

export interface PassportRevokedEvent extends BaseEvent {
  type: 'auth.passport_revoked'
  passport_id: string
  subject_id: string
  reason: string
}

// ─── Job / Compute Events (Atlas + GP4U core) ─────────────────────────────────

export interface JobCreatedEvent extends BaseEvent {
  type: 'job.created'
  job_id: string
  subject_id: string
  gpu_id: string
  node_id?: string
  workload_type: string
  vram_requested_gb: number
  estimated_duration_hours: number
  estimated_cost_usd: number
  region: string
  supply_tier?: string    // BACKBONE | CAMPUS | EDGE — populated by Atlas
}

export interface JobStartedEvent extends BaseEvent {
  type: 'job.started'
  job_id: string
  subject_id: string
  gpu_id: string
  allocation_id: string
  actual_price_per_hour: number
}

export interface JobCompletedEvent extends BaseEvent {
  type: 'job.completed'
  job_id: string
  subject_id: string
  gpu_id: string
  allocation_id: string
  duration_hours: number
  actual_cost_usd: number
  energy_consumed_kwh?: number   // Populated by Russian-Doll agent
}

export interface JobFailedEvent extends BaseEvent {
  type: 'job.failed'
  job_id: string
  subject_id: string
  gpu_id: string
  allocation_id?: string
  failure_reason: string
}

// ─── GPU / Node Events (Atlas + GP4U marketplace) ─────────────────────────────

export interface GPUListedEvent extends BaseEvent {
  type: 'gpu.listed'
  gpu_id: string
  node_id: string
  provider: string
  vram_gb: number
  price_per_hour: number
  region: string
  supply_tier: string
}

export interface GPUStatusChangedEvent extends BaseEvent {
  type: 'gpu.status_changed'
  gpu_id: string
  previous_status: string
  new_status: string
  reason?: string
}

export interface GPUHealthReportedEvent extends BaseEvent {
  type: 'gpu.health_reported'
  gpu_id: string
  thermal_score: number
  memory_score: number
  uptime_hours: number
  past_usage_tags: string[]
}

// ─── Arbitrage Events (feeds Mist + Energy chambers) ──────────────────────────

export interface ArbitrageCalculatedEvent extends BaseEvent {
  type: 'arbitrage.calculated'
  subject_id: string
  gpu_type: string
  num_gpus: number
  duration_hours: number
  results: Array<{
    provider: string
    price_per_hour: number
    total_cost: number
    available: boolean
  }>
  best_provider: string
  potential_savings_usd: number
}

// ─── Memory / VRAM Events (feeds Mnemo chamber) ───────────────────────────────

export interface MemoryStakedEvent extends BaseEvent {
  type: 'memory.staked'
  subject_id: string
  gpu_id: string
  vram_gb: number
  ram_gb: number
  idle_schedule?: string
  asking_price_per_gb_sec: number
}

export interface MemoryAllocatedEvent extends BaseEvent {
  type: 'memory.allocated'
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

// ─── Network / Latency Events (feeds Aetherion chamber) ───────────────────────

export interface RouteCalculatedEvent extends BaseEvent {
  type: 'network.route_calculated'
  job_id: string
  origin_node_id: string
  destination_node_id: string
  path: string[]
  latency_ms: number
  bandwidth_gbps: number
  alpha_score: number    // Latency component of α/β/γ scoring
  beta_score: number     // Bandwidth component
  gamma_score: number    // Cost component
  total_score: number
}

// ─── Energy Events (feeds Energy Broker + Mist chambers) ──────────────────────

export interface EnergyConsumedEvent extends BaseEvent {
  type: 'energy.consumed'
  job_id: string
  gpu_id: string
  region: string
  kwh: number
  cost_usd: number
  carbon_kg_co2e?: number
  energy_price_per_kwh: number
}

// ─── Security / Threat Events (Tutela) ────────────────────────────────────────

export interface AnomalyDetectedEvent extends BaseEvent {
  type: 'security.anomaly_detected'
  job_id: string
  subject_id: string
  anomaly_type: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  risk_score: number
  action_taken: string
}

export interface KillSwitchFiredEvent extends BaseEvent {
  type: 'security.kill_switch_fired'
  node_id: string
  triggered_by: string
  reason: string
  jobs_terminated: string[]
}

// ─── Provenance Events (feeds Veritas chamber) ────────────────────────────────

export interface DataProvenanceRecordedEvent extends BaseEvent {
  type: 'provenance.recorded'
  job_id: string
  subject_id: string
  gpu_id: string
  model_hash?: string
  dataset_hash?: string
  output_hash?: string
  duration_hours: number
}

// ─── Union of all platform events ─────────────────────────────────────────────

export type PlatformEvent =
  | UserRegisteredEvent
  | UserAuthenticatedEvent
  | PassportRevokedEvent
  | JobCreatedEvent
  | JobStartedEvent
  | JobCompletedEvent
  | JobFailedEvent
  | GPUListedEvent
  | GPUStatusChangedEvent
  | GPUHealthReportedEvent
  | ArbitrageCalculatedEvent
  | MemoryStakedEvent
  | MemoryAllocatedEvent
  | RouteCalculatedEvent
  | EnergyConsumedEvent
  | AnomalyDetectedEvent
  | KillSwitchFiredEvent
  | DataProvenanceRecordedEvent

export type PlatformEventType = PlatformEvent['type']
