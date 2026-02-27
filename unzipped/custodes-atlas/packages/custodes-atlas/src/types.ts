/**
 * CUSTODES ATLAS — Core Types
 * Resource Discovery, Registry & Intelligent Routing
 *
 * Atlas knows where every GPU is, what it can do, what it costs,
 * and how to route a job to the optimal node.
 *
 * It is the topology brain of the stack. When a job is submitted,
 * Aedituus decides IF it can run. Atlas decides WHERE it runs.
 *
 * Three layers of supply:
 *   BACKBONE  — University/enterprise data centers (high reliability, best SLA)
 *   CAMPUS    — Student/lab GPUs on institutional networks (medium reliability)
 *   EDGE      — Peer-to-peer consumer GPUs (variable, price-competitive)
 *
 * Atlas does not execute jobs — it finds and reserves the right resource,
 * then hands the allocation to the orchestration layer.
 */

// ─── Supply Tiers ─────────────────────────────────────────────────────────────

export enum SupplyTier {
  BACKBONE = 'BACKBONE', // Institutional data centers — highest SLA
  CAMPUS   = 'CAMPUS',   // Campus-connected student/lab GPUs
  EDGE     = 'EDGE',     // Consumer P2P hosts
}

export enum GPUTier {
  H100     = 'H100',
  A100_80  = 'A100_80',
  A100_40  = 'A100_40',
  L40S     = 'L40S',
  RTX_4090 = 'RTX_4090',
  RTX_3090 = 'RTX_3090',
  OTHER    = 'OTHER',
}

export enum NodeStatus {
  ONLINE      = 'ONLINE',      // Available for allocation
  BUSY        = 'BUSY',        // Fully allocated
  PARTIAL     = 'PARTIAL',     // Some capacity available
  OFFLINE     = 'OFFLINE',     // Unreachable
  MAINTENANCE = 'MAINTENANCE', // Scheduled downtime
  SUSPENDED   = 'SUSPENDED',   // Tutela-suspended (policy violation)
  BENCHMARKING= 'BENCHMARKING',// Veritas running benchmark
}

export enum NetworkTopology {
  DIRECT_FIBER    = 'DIRECT_FIBER',   // Data center grade
  CAMPUS_LAN      = 'CAMPUS_LAN',     // University network
  WIREGUARD_MESH  = 'WIREGUARD_MESH', // Outerim tunnel
  RESIDENTIAL     = 'RESIDENTIAL',    // Consumer broadband
}

// ─── Node (a physical GPU host) ───────────────────────────────────────────────

/**
 * A Node is a physical machine with one or more GPUs registered in Atlas.
 * Nodes can be single-GPU dorm machines or multi-GPU data center servers.
 */
export interface AtlasNode {
  node_id: string                   // UUID
  host_subject_id: string           // Dextera subject_id of the host
  institution_id?: string           // If on campus
  campus_id?: string                // Specific campus location
  supply_tier: SupplyTier

  // Network
  topology: NetworkTopology
  tunnel_endpoint?: string          // Outerim WireGuard endpoint
  region: string                    // e.g. 'us-east-1', 'eu-central'
  latency_ms_to_backbone?: number   // Measured by Outerim
  bandwidth_mbps?: number

  // Host metadata
  os: string                        // e.g. 'Ubuntu 24.04'
  docker_version?: string
  nvidia_driver_version?: string
  cuda_version?: string

  // Status
  status: NodeStatus
  last_heartbeat_at: string         // ISO 8601
  heartbeat_interval_seconds: number

  // Trust
  veritas_verified: boolean         // Has passed Veritas benchmark
  veritas_verified_at?: string
  trust_score: number               // Inherited from host's Dextera trust score
  tutela_flags: string[]            // Active Tutela flags on this node

  // Timestamps
  registered_at: string
  updated_at: string
}

// ─── GPU Resource ─────────────────────────────────────────────────────────────

/**
 * A single GPU attached to a Node.
 * One Node can have multiple GPUs.
 */
export interface AtlasGPU {
  gpu_id: string                    // UUID
  node_id: string                   // Parent node
  gpu_uuid: string                  // NVIDIA GPU UUID (from nvidia-smi)

  // Hardware
  gpu_tier: GPUTier
  model_name: string                // e.g. 'NVIDIA H100 SXM5 80GB'
  vram_gb: number                   // Total VRAM
  vram_available_gb: number         // Current available VRAM
  cuda_cores?: number
  tensor_cores?: number
  nvlink_capable: boolean
  mig_capable: boolean
  mig_enabled: boolean

  // Performance (from Veritas benchmarks)
  fp16_tflops?: number
  fp32_tflops?: number
  memory_bandwidth_gbps?: number
  benchmark_score?: number          // Veritas composite score
  benchmark_version?: string

  // Economics
  price_per_hour: number            // USD, set by host
  price_mode: PriceMode
  min_duration_hours: number
  max_duration_hours?: number

  // Constraints
  power_cap_watts: number           // Hard power limit (Tutela-enforced)
  allowed_workload_types: string[]  // e.g. ['TRAINING', 'INFERENCE']
  max_concurrent_jobs: number

  // Status
  status: NodeStatus
  current_jobs: string[]            // Active job IDs

  // Telemetry (latest reading)
  telemetry?: GPUTelemetry

  registered_at: string
  updated_at: string
}

export enum PriceMode {
  FIXED    = 'FIXED',    // Flat $/hr
  SPOT     = 'SPOT',     // Variable, demand-based
  RESERVED = 'RESERVED', // Pre-committed lower rate
  BURST    = 'BURST',    // Premium for immediate availability
}

// ─── GPU Telemetry ────────────────────────────────────────────────────────────

/**
 * Real-time telemetry snapshot from a GPU.
 * Reported by the host agent every N seconds.
 * Stored by Obsidian, consumed by Veritas and Tutela.
 */
export interface GPUTelemetry {
  gpu_id: string
  node_id: string
  timestamp: string               // ISO 8601

  // Utilization
  gpu_utilization_pct: number     // 0–100
  memory_utilization_pct: number  // 0–100
  vram_used_gb: number
  vram_free_gb: number

  // Thermal
  temperature_c: number
  fan_speed_pct?: number
  thermal_throttling: boolean

  // Power
  power_draw_watts: number
  power_limit_watts: number
  power_cap_enforced: boolean

  // Network
  pcie_rx_mbps?: number
  pcie_tx_mbps?: number

  // Process info (aggregated, not per-process for privacy)
  active_process_count: number
  active_job_ids: string[]
}

// ─── Allocation ───────────────────────────────────────────────────────────────

/**
 * A reservation of GPU resources for a specific job.
 * Created by Atlas, consumed by the orchestration layer.
 */
export interface GPUAllocation {
  allocation_id: string
  job_id: string
  subject_id: string
  gpu_id: string
  node_id: string

  // What was allocated
  vram_reserved_gb: number
  power_cap_watts: number
  max_duration_hours: number
  workload_type: string

  // Pricing
  price_per_hour: number
  price_mode: PriceMode
  estimated_cost: number

  // Timing
  reserved_at: string             // When allocation was created
  started_at?: string             // When job actually started
  expires_at: string              // Hard deadline (Tutela kills if exceeded)
  released_at?: string            // When allocation was freed

  status: AllocationStatus
}

export enum AllocationStatus {
  RESERVED  = 'RESERVED',   // Claimed but job not yet started
  ACTIVE    = 'ACTIVE',     // Job running
  COMPLETED = 'COMPLETED',  // Job finished normally
  CANCELLED = 'CANCELLED',  // Cancelled before start
  EXPIRED   = 'EXPIRED',    // Exceeded max duration
  FAILED    = 'FAILED',     // Job failed
}

// ─── Discovery & Routing ──────────────────────────────────────────────────────

/**
 * Criteria for finding matching GPU resources.
 */
export interface DiscoveryCriteria {
  // Hardware requirements
  min_vram_gb: number
  gpu_tiers?: GPUTier[]             // If empty, any tier accepted
  min_gpu_count?: number            // Default: 1
  require_nvlink?: boolean

  // Workload
  workload_type: string
  estimated_duration_hours: number
  framework?: string                // e.g. 'pytorch', 'tensorflow'

  // Geography
  preferred_regions?: string[]
  institution_id?: string           // Prefer campus nodes for this institution
  campus_id?: string

  // Supply tier preferences
  preferred_tiers?: SupplyTier[]    // Order = preference

  // Economics
  max_price_per_hour?: number
  price_mode?: PriceMode

  // Quality
  min_benchmark_score?: number
  require_veritas_verified?: boolean
  min_node_trust_score?: number
}

export interface DiscoveryResult {
  gpu_id: string
  node_id: string
  gpu: AtlasGPU
  node: AtlasNode
  match_score: number               // 0–100 composite match score
  match_reasons: string[]           // Human-readable reasons
  estimated_wait_seconds: number    // If not immediately available
  price_per_hour: number
  supply_tier: SupplyTier
}

// ─── Routing Decision ─────────────────────────────────────────────────────────

export interface RoutingDecision {
  job_id: string
  selected_gpu_id: string
  selected_node_id: string
  allocation_id: string
  supply_tier: SupplyTier
  routing_score: number
  alternatives_considered: number
  routing_strategy: RoutingStrategy
  decided_at: string
}

export enum RoutingStrategy {
  CHEAPEST       = 'CHEAPEST',       // Minimize cost
  FASTEST        = 'FASTEST',        // Minimize latency / queue time
  HIGHEST_TRUST  = 'HIGHEST_TRUST',  // Maximize reliability
  INSTITUTIONAL  = 'INSTITUTIONAL',  // Prefer campus nodes
  BALANCED       = 'BALANCED',       // Default: cost + trust + latency
}

// ─── Atlas Config ──────────────────────────────────────────────────────────────

export interface AtlasConfig {
  instance_id: string
  heartbeat_timeout_seconds: number    // Mark node OFFLINE if no heartbeat (default: 60)
  allocation_reservation_ttl_seconds: number  // Cancel reserved but unstarted jobs (default: 300)
  default_routing_strategy: RoutingStrategy
  max_discovery_results: number        // Cap on results returned (default: 20)
}

// ─── Store Interfaces ─────────────────────────────────────────────────────────

export interface AtlasNodeStore {
  register(node: AtlasNode): Promise<void>
  update(node_id: string, update: Partial<AtlasNode>): Promise<void>
  findById(node_id: string): Promise<AtlasNode | null>
  findByInstitution(institution_id: string): Promise<AtlasNode[]>
  findOnline(): Promise<AtlasNode[]>
  updateHeartbeat(node_id: string): Promise<void>
  markOffline(node_id: string): Promise<void>
}

export interface AtlasGPUStore {
  register(gpu: AtlasGPU): Promise<void>
  update(gpu_id: string, update: Partial<AtlasGPU>): Promise<void>
  findById(gpu_id: string): Promise<AtlasGPU | null>
  findByNode(node_id: string): Promise<AtlasGPU[]>
  findAvailable(criteria: DiscoveryCriteria): Promise<AtlasGPU[]>
  updateTelemetry(gpu_id: string, telemetry: GPUTelemetry): Promise<void>
  updateAvailableVRAM(gpu_id: string, vram_available_gb: number): Promise<void>
}

export interface AtlasAllocationStore {
  create(allocation: GPUAllocation): Promise<void>
  update(allocation_id: string, update: Partial<GPUAllocation>): Promise<void>
  findById(allocation_id: string): Promise<GPUAllocation | null>
  findByJob(job_id: string): Promise<GPUAllocation[]>
  findActiveByGPU(gpu_id: string): Promise<GPUAllocation[]>
  findExpired(): Promise<GPUAllocation[]>
  release(allocation_id: string): Promise<void>
}
