/**
 * CUSTODES ATLAS — Registry Service
 *
 * Manages the lifecycle of nodes and GPUs in the Atlas registry.
 * Handles registration, heartbeats, telemetry updates, and
 * automatic offline detection.
 *
 * The registry is the source of truth for what supply exists.
 * The routing engine queries this registry to find matches.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  AtlasNode,
  AtlasGPU,
  GPUTelemetry,
  NodeStatus,
  AtlasConfig,
  AtlasNodeStore,
  AtlasGPUStore,
  AtlasAllocationStore,
  SupplyTier,
  GPUTier,
  NetworkTopology,
  PriceMode,
  AllocationStatus,
} from './types'

// ─── Obsidian Sink ────────────────────────────────────────────────────────────

export interface AtlasObsidianSink {
  emitGPURegistered(params: {
    subject_id: string
    gpu_id: string
    node_id: string
    gpu_tier: string
    vram_gb: number
    supply_tier: string
    institution_id?: string
  }): Promise<void>

  emitNodeStatusChanged(params: {
    node_id: string
    host_subject_id: string
    old_status: string
    new_status: string
    reason: string
  }): Promise<void>

  emitAllocationCreated(params: {
    subject_id: string
    gpu_id: string
    node_id: string
    job_id: string
    vram_reserved_gb: number
    price_per_hour: number
    supply_tier: string
  }): Promise<void>

  emitAllocationReleased(params: {
    allocation_id: string
    job_id: string
    gpu_id: string
    status: string
    duration_hours: number
    actual_cost: number
  }): Promise<void>
}

// ─── Node Registration Request ────────────────────────────────────────────────

export interface RegisterNodeRequest {
  host_subject_id: string
  institution_id?: string
  campus_id?: string
  supply_tier: SupplyTier
  topology: NetworkTopology
  tunnel_endpoint?: string
  region: string
  os: string
  docker_version?: string
  nvidia_driver_version?: string
  cuda_version?: string
  heartbeat_interval_seconds?: number
}

export interface RegisterGPURequest {
  node_id: string
  gpu_uuid: string           // From nvidia-smi
  gpu_tier: GPUTier
  model_name: string
  vram_gb: number
  cuda_cores?: number
  tensor_cores?: number
  nvlink_capable?: boolean
  mig_capable?: boolean
  price_per_hour: number
  price_mode?: PriceMode
  min_duration_hours?: number
  max_duration_hours?: number
  power_cap_watts: number
  allowed_workload_types?: string[]
  max_concurrent_jobs?: number
}

// ─── Registry Service ─────────────────────────────────────────────────────────

export class AtlasRegistryService {
  private config: AtlasConfig
  private nodeStore: AtlasNodeStore
  private gpuStore: AtlasGPUStore
  private allocationStore: AtlasAllocationStore
  private obsidian: AtlasObsidianSink

  constructor(
    config: AtlasConfig,
    nodeStore: AtlasNodeStore,
    gpuStore: AtlasGPUStore,
    allocationStore: AtlasAllocationStore,
    obsidian: AtlasObsidianSink
  ) {
    this.config = config
    this.nodeStore = nodeStore
    this.gpuStore = gpuStore
    this.allocationStore = allocationStore
    this.obsidian = obsidian
  }

  // ─── Node Lifecycle ────────────────────────────────────────────────────────

  async registerNode(request: RegisterNodeRequest): Promise<AtlasNode> {
    const now = new Date().toISOString()
    const node: AtlasNode = {
      node_id:                   uuidv4(),
      host_subject_id:           request.host_subject_id,
      institution_id:            request.institution_id,
      campus_id:                 request.campus_id,
      supply_tier:               request.supply_tier,
      topology:                  request.topology,
      tunnel_endpoint:           request.tunnel_endpoint,
      region:                    request.region,
      os:                        request.os,
      docker_version:            request.docker_version,
      nvidia_driver_version:     request.nvidia_driver_version,
      cuda_version:              request.cuda_version,
      status:                    NodeStatus.ONLINE,
      last_heartbeat_at:         now,
      heartbeat_interval_seconds: request.heartbeat_interval_seconds ?? 30,
      veritas_verified:          false,
      trust_score:               0,   // Set after Dextera lookup
      tutela_flags:              [],
      registered_at:             now,
      updated_at:                now,
    }

    await this.nodeStore.register(node)
    return node
  }

  /**
   * Register a GPU on an existing node.
   * Called by the host agent after node registration.
   */
  async registerGPU(request: RegisterGPURequest): Promise<AtlasGPU> {
    const node = await this.nodeStore.findById(request.node_id)
    if (!node) throw new Error(`Node not found: ${request.node_id}`)

    const now = new Date().toISOString()
    const gpu: AtlasGPU = {
      gpu_id:                  uuidv4(),
      node_id:                 request.node_id,
      gpu_uuid:                request.gpu_uuid,
      gpu_tier:                request.gpu_tier,
      model_name:              request.model_name,
      vram_gb:                 request.vram_gb,
      vram_available_gb:       request.vram_gb,  // Initially all available
      cuda_cores:              request.cuda_cores,
      tensor_cores:            request.tensor_cores,
      nvlink_capable:          request.nvlink_capable ?? false,
      mig_capable:             request.mig_capable ?? false,
      mig_enabled:             false,
      price_per_hour:          request.price_per_hour,
      price_mode:              request.price_mode ?? PriceMode.FIXED,
      min_duration_hours:      request.min_duration_hours ?? 0.25,
      max_duration_hours:      request.max_duration_hours,
      power_cap_watts:         request.power_cap_watts,
      allowed_workload_types:  request.allowed_workload_types ?? ['TRAINING', 'INFERENCE'],
      max_concurrent_jobs:     request.max_concurrent_jobs ?? 1,
      status:                  NodeStatus.ONLINE,
      current_jobs:            [],
      registered_at:           now,
      updated_at:              now,
    }

    await this.gpuStore.register(gpu)

    await this.obsidian.emitGPURegistered({
      subject_id:    node.host_subject_id,
      gpu_id:        gpu.gpu_id,
      node_id:       gpu.node_id,
      gpu_tier:      gpu.gpu_tier,
      vram_gb:       gpu.vram_gb,
      supply_tier:   node.supply_tier,
      institution_id: node.institution_id,
    })

    return gpu
  }

  /**
   * Process a heartbeat from a host agent.
   * Updates node status and resets offline timer.
   */
  async heartbeat(node_id: string, telemetry?: GPUTelemetry[]): Promise<void> {
    await this.nodeStore.updateHeartbeat(node_id)

    if (telemetry?.length) {
      for (const t of telemetry) {
        await this.gpuStore.updateTelemetry(t.gpu_id, t)
        await this.gpuStore.updateAvailableVRAM(t.gpu_id, t.vram_free_gb)
      }
    }
  }

  /**
   * Mark a node offline when heartbeat times out.
   * Called by the watchdog process.
   */
  async markNodeOffline(node_id: string, reason: string): Promise<void> {
    const node = await this.nodeStore.findById(node_id)
    if (!node) return

    await this.nodeStore.update(node_id, { status: NodeStatus.OFFLINE })
    await this.obsidian.emitNodeStatusChanged({
      node_id,
      host_subject_id: node.host_subject_id,
      old_status:      node.status,
      new_status:      NodeStatus.OFFLINE,
      reason,
    })

    // Cancel any RESERVED (not yet started) allocations on this node
    const gpus = await this.gpuStore.findByNode(node_id)
    for (const gpu of gpus) {
      const allocations = await this.allocationStore.findActiveByGPU(gpu.gpu_id)
      for (const alloc of allocations) {
        if (alloc.status === AllocationStatus.RESERVED) {
          await this.allocationStore.update(alloc.allocation_id, {
            status:      AllocationStatus.CANCELLED,
            released_at: new Date().toISOString(),
          })
        }
      }
    }
  }

  /**
   * Suspend a node (called by Tutela on policy violation).
   */
  async suspendNode(node_id: string, reason: string): Promise<void> {
    const node = await this.nodeStore.findById(node_id)
    if (!node) return

    await this.nodeStore.update(node_id, {
      status:       NodeStatus.SUSPENDED,
      tutela_flags: [...(node.tutela_flags ?? []), reason],
    })

    await this.obsidian.emitNodeStatusChanged({
      node_id,
      host_subject_id: node.host_subject_id,
      old_status:      node.status,
      new_status:      NodeStatus.SUSPENDED,
      reason,
    })
  }

  /**
   * Mark a node as Veritas-verified after successful benchmark.
   */
  async markVeritasVerified(node_id: string, gpu_id: string, benchmark_score: number): Promise<void> {
    await this.nodeStore.update(node_id, {
      veritas_verified:    true,
      veritas_verified_at: new Date().toISOString(),
    })
    await this.gpuStore.update(gpu_id, { benchmark_score })
  }

  /**
   * Watchdog: scan for nodes that have missed heartbeats.
   * Run this on a cron every N seconds.
   */
  async runHeartbeatWatchdog(): Promise<{ marked_offline: string[] }> {
    const online_nodes = await this.nodeStore.findOnline()
    const now = Date.now()
    const marked_offline: string[] = []

    for (const node of online_nodes) {
      const last_beat = new Date(node.last_heartbeat_at).getTime()
      const elapsed_seconds = (now - last_beat) / 1000
      const timeout = node.heartbeat_interval_seconds * 3  // 3x interval = offline

      if (elapsed_seconds > timeout) {
        await this.markNodeOffline(node.node_id, `Heartbeat timeout: ${Math.round(elapsed_seconds)}s`)
        marked_offline.push(node.node_id)
      }
    }

    return { marked_offline }
  }

  /**
   * Watchdog: expire allocations that have exceeded max duration.
   * Run this on a cron every 60 seconds.
   */
  async runAllocationWatchdog(): Promise<{ expired: string[] }> {
    const expired_allocations = await this.allocationStore.findExpired()
    const expired: string[] = []

    for (const alloc of expired_allocations) {
      await this.allocationStore.update(alloc.allocation_id, {
        status:      AllocationStatus.EXPIRED,
        released_at: new Date().toISOString(),
      })
      await this.obsidian.emitAllocationReleased({
        allocation_id: alloc.allocation_id,
        job_id:        alloc.job_id,
        gpu_id:        alloc.gpu_id,
        status:        AllocationStatus.EXPIRED,
        duration_hours: alloc.max_duration_hours,
        actual_cost:   alloc.estimated_cost,
      })
      expired.push(alloc.allocation_id)
    }

    return { expired }
  }
}
