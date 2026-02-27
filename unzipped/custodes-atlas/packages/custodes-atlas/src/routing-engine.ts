/**
 * CUSTODES ATLAS — Routing Engine
 *
 * Finds the optimal GPU for a given job based on:
 *   - Hardware requirements (VRAM, tier, CUDA, NVLink)
 *   - Supply tier preference (BACKBONE > CAMPUS > EDGE)
 *   - Trust and verification scores
 *   - Latency and geography
 *   - Price
 *   - Routing strategy
 *
 * Scoring is transparent — every decision includes match_reasons
 * so disputes can be resolved with evidence.
 */

import {
  AtlasGPU,
  AtlasNode,
  DiscoveryCriteria,
  DiscoveryResult,
  RoutingDecision,
  RoutingStrategy,
  NodeStatus,
  SupplyTier,
  AtlasConfig,
  AtlasNodeStore,
  AtlasGPUStore,
  AtlasAllocationStore,
  GPUAllocation,
  AllocationStatus,
  PriceMode,
} from './types'
import { v4 as uuidv4 } from 'uuid'
import { AtlasObsidianSink } from './registry-service'

// ─── Routing Engine ───────────────────────────────────────────────────────────

export class AtlasRoutingEngine {
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
    this.config          = config
    this.nodeStore       = nodeStore
    this.gpuStore        = gpuStore
    this.allocationStore = allocationStore
    this.obsidian        = obsidian
  }

  /**
   * Discover available GPUs matching the given criteria.
   * Returns ranked list — best match first.
   */
  async discover(criteria: DiscoveryCriteria): Promise<DiscoveryResult[]> {
    // Pull candidates from store
    const candidate_gpus = await this.gpuStore.findAvailable(criteria)
    if (candidate_gpus.length === 0) return []

    // Load parent nodes
    const node_ids = [...new Set(candidate_gpus.map(g => g.node_id))]
    const nodes_arr = await Promise.all(node_ids.map(id => this.nodeStore.findById(id)))
    const node_map = new Map<string, AtlasNode>(
      nodes_arr
        .filter((n): n is AtlasNode => n !== null)
        .map(n => [n.node_id, n])
    )

    // Filter out nodes that are not ONLINE or PARTIAL
    const alive_gpus = candidate_gpus.filter(gpu => {
      const node = node_map.get(gpu.node_id)
      if (!node) return false
      if (node.status !== NodeStatus.ONLINE && node.status !== NodeStatus.PARTIAL) return false
      if (gpu.status !== NodeStatus.ONLINE && gpu.status !== NodeStatus.PARTIAL) return false
      return true
    })

    // Score each candidate
    const results: DiscoveryResult[] = alive_gpus
      .map(gpu => {
        const node = node_map.get(gpu.node_id)!
        return this.scoreCandidate(gpu, node, criteria)
      })
      .filter(r => r !== null) as DiscoveryResult[]

    // Sort by match_score descending
    results.sort((a, b) => b.match_score - a.match_score)

    return results.slice(0, this.config.max_discovery_results)
  }

  /**
   * Route a job to the best available GPU and create an allocation.
   * This is the atomic operation: discover + reserve in one call.
   */
  async route(
    job_id: string,
    subject_id: string,
    criteria: DiscoveryCriteria,
    strategy: RoutingStrategy = this.config.default_routing_strategy
  ): Promise<RoutingDecision | null> {
    const candidates = await this.discover(criteria)
    if (candidates.length === 0) return null

    // Apply routing strategy re-ranking
    const ranked = this.applyStrategy(candidates, strategy)
    const winner = ranked[0]

    // Create allocation
    const reservation_expires = new Date(
      Date.now() + criteria.estimated_duration_hours * 3600 * 1000
    ).toISOString()

    const allocation: GPUAllocation = {
      allocation_id:    uuidv4(),
      job_id,
      subject_id,
      gpu_id:           winner.gpu_id,
      node_id:          winner.node_id,
      vram_reserved_gb: criteria.min_vram_gb,
      power_cap_watts:  winner.gpu.power_cap_watts,
      max_duration_hours: criteria.estimated_duration_hours,
      workload_type:    criteria.workload_type,
      price_per_hour:   winner.price_per_hour,
      price_mode:       winner.gpu.price_mode,
      estimated_cost:   winner.price_per_hour * criteria.estimated_duration_hours,
      reserved_at:      new Date().toISOString(),
      expires_at:       reservation_expires,
      status:           AllocationStatus.RESERVED,
    }

    await this.allocationStore.create(allocation)

    // Update GPU available VRAM
    const updated_vram = Math.max(0, winner.gpu.vram_available_gb - criteria.min_vram_gb)
    await this.gpuStore.update(winner.gpu_id, {
      vram_available_gb: updated_vram,
      current_jobs:      [...winner.gpu.current_jobs, job_id],
    })

    // Emit to Obsidian
    await this.obsidian.emitAllocationCreated({
      subject_id,
      gpu_id:           winner.gpu_id,
      node_id:          winner.node_id,
      job_id,
      vram_reserved_gb: criteria.min_vram_gb,
      price_per_hour:   winner.price_per_hour,
      supply_tier:      winner.supply_tier,
    })

    return {
      job_id,
      selected_gpu_id:          winner.gpu_id,
      selected_node_id:         winner.node_id,
      allocation_id:            allocation.allocation_id,
      supply_tier:              winner.supply_tier,
      routing_score:            winner.match_score,
      alternatives_considered:  candidates.length,
      routing_strategy:         strategy,
      decided_at:               new Date().toISOString(),
    }
  }

  /**
   * Release an allocation when a job completes, fails, or is cancelled.
   */
  async release(
    allocation_id: string,
    final_status: AllocationStatus,
    actual_cost: number
  ): Promise<void> {
    const alloc = await this.allocationStore.findById(allocation_id)
    if (!alloc) return

    const now           = new Date().toISOString()
    const started       = alloc.started_at ? new Date(alloc.started_at) : new Date(alloc.reserved_at)
    const duration_ms   = Date.now() - started.getTime()
    const duration_hours = duration_ms / 3600000

    await this.allocationStore.update(allocation_id, {
      status:      final_status,
      released_at: now,
    })

    // Restore VRAM
    const gpu = await this.gpuStore.findById(alloc.gpu_id)
    if (gpu) {
      await this.gpuStore.update(alloc.gpu_id, {
        vram_available_gb: gpu.vram_available_gb + alloc.vram_reserved_gb,
        current_jobs:      gpu.current_jobs.filter(id => id !== alloc.job_id),
      })
    }

    await this.obsidian.emitAllocationReleased({
      allocation_id,
      job_id:        alloc.job_id,
      gpu_id:        alloc.gpu_id,
      status:        final_status,
      duration_hours,
      actual_cost,
    })
  }

  // ─── Scoring ───────────────────────────────────────────────────────────────

  private scoreCandidate(
    gpu: AtlasGPU,
    node: AtlasNode,
    criteria: DiscoveryCriteria
  ): DiscoveryResult | null {
    const reasons: string[] = []
    let score = 0

    // Hard requirements — disqualify immediately if not met
    if (gpu.vram_available_gb < criteria.min_vram_gb) return null
    if (criteria.gpu_tiers?.length && !criteria.gpu_tiers.includes(gpu.gpu_tier)) return null
    if (criteria.require_nvlink && !gpu.nvlink_capable) return null
    if (criteria.require_veritas_verified && !node.veritas_verified) return null
    if (criteria.min_benchmark_score && (gpu.benchmark_score ?? 0) < criteria.min_benchmark_score) return null
    if (criteria.min_node_trust_score && node.trust_score < criteria.min_node_trust_score) return null
    if (criteria.max_price_per_hour && gpu.price_per_hour > criteria.max_price_per_hour) return null
    if (!gpu.allowed_workload_types.includes(criteria.workload_type)) return null

    // ── Supply tier score (0–25) ─────────────────────────────────────────────
    const tier_preference = criteria.preferred_tiers ?? [SupplyTier.BACKBONE, SupplyTier.CAMPUS, SupplyTier.EDGE]
    const tier_rank = tier_preference.indexOf(node.supply_tier)
    if (tier_rank === 0) {
      score += 25; reasons.push(`Preferred supply tier: ${node.supply_tier}`)
    } else if (tier_rank === 1) {
      score += 15; reasons.push(`Acceptable supply tier: ${node.supply_tier}`)
    } else {
      score += 5
    }

    // ── Institution preference (0–20) ────────────────────────────────────────
    if (criteria.institution_id && node.institution_id === criteria.institution_id) {
      score += 20; reasons.push('Preferred institution match')
    } else if (criteria.campus_id && node.campus_id === criteria.campus_id) {
      score += 20; reasons.push('Preferred campus match')
    }

    // ── Trust score (0–15) ───────────────────────────────────────────────────
    const trust_contribution = Math.floor((node.trust_score / 100) * 15)
    score += trust_contribution
    if (node.trust_score >= 80) reasons.push(`High trust node (${node.trust_score})`)

    // ── Veritas verified (0–10) ──────────────────────────────────────────────
    if (node.veritas_verified) {
      score += 10; reasons.push('Veritas benchmark verified')
    }

    // ── VRAM headroom (0–10) ─────────────────────────────────────────────────
    const vram_headroom = gpu.vram_available_gb - criteria.min_vram_gb
    if (vram_headroom >= criteria.min_vram_gb) {
      score += 10; reasons.push(`Good VRAM headroom: ${vram_headroom.toFixed(1)}GB free`)
    } else if (vram_headroom > 0) {
      score += 5
    }

    // ── Price competitiveness (0–10) ─────────────────────────────────────────
    if (criteria.max_price_per_hour) {
      const price_ratio = 1 - (gpu.price_per_hour / criteria.max_price_per_hour)
      score += Math.floor(price_ratio * 10)
    } else {
      score += 5  // Neutral if no price preference
    }

    // ── Latency (0–5) ────────────────────────────────────────────────────────
    if (node.latency_ms_to_backbone !== undefined) {
      if (node.latency_ms_to_backbone < 5)   { score += 5; reasons.push('Very low latency') }
      else if (node.latency_ms_to_backbone < 20) { score += 3 }
      else if (node.latency_ms_to_backbone < 50) { score += 1 }
    }

    // ── Region preference (0–5) ──────────────────────────────────────────────
    if (criteria.preferred_regions?.includes(node.region)) {
      score += 5; reasons.push(`Preferred region: ${node.region}`)
    }

    const estimated_wait = gpu.current_jobs.length > 0
      ? gpu.current_jobs.length * 1800  // Rough: 30 min per active job
      : 0

    return {
      gpu_id:                  gpu.gpu_id,
      node_id:                 node.node_id,
      gpu,
      node,
      match_score:             Math.min(100, score),
      match_reasons:           reasons,
      estimated_wait_seconds:  estimated_wait,
      price_per_hour:          gpu.price_per_hour,
      supply_tier:             node.supply_tier,
    }
  }

  // ─── Strategy Re-ranking ──────────────────────────────────────────────────

  private applyStrategy(
    results: DiscoveryResult[],
    strategy: RoutingStrategy
  ): DiscoveryResult[] {
    const copy = [...results]

    switch (strategy) {
      case RoutingStrategy.CHEAPEST:
        return copy.sort((a, b) => a.price_per_hour - b.price_per_hour)

      case RoutingStrategy.FASTEST:
        return copy.sort((a, b) => a.estimated_wait_seconds - b.estimated_wait_seconds)

      case RoutingStrategy.HIGHEST_TRUST:
        return copy.sort((a, b) => b.node.trust_score - a.node.trust_score)

      case RoutingStrategy.INSTITUTIONAL:
        return copy.sort((a, b) => {
          const a_inst = a.node.supply_tier === SupplyTier.BACKBONE ? 0
            : a.node.supply_tier === SupplyTier.CAMPUS ? 1 : 2
          const b_inst = b.node.supply_tier === SupplyTier.BACKBONE ? 0
            : b.node.supply_tier === SupplyTier.CAMPUS ? 1 : 2
          return a_inst - b_inst
        })

      case RoutingStrategy.BALANCED:
      default:
        // Default: already sorted by composite match_score
        return copy
    }
  }
}
