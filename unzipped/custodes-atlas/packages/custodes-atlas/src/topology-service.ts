/**
 * CUSTODES ATLAS — Topology Service
 *
 * Manages network topology awareness across the supply network.
 * Tracks campus boundaries, WireGuard mesh connections (Outerim),
 * and inter-node latency to inform routing decisions.
 *
 * The topology map answers:
 *   - Which nodes are on the same campus LAN?
 *   - What is the measured latency between nodes?
 *   - Which nodes share NVLink / InfiniBand fabric?
 *   - Where are the backbone uplinks?
 */

import {
  AtlasNode,
  NetworkTopology,
  SupplyTier,
} from './types'

// ─── Topology Types ───────────────────────────────────────────────────────────

export interface CampusTopology {
  campus_id: string
  institution_id: string
  campus_name: string
  backbone_nodes: string[]          // node_ids of backbone (data center) nodes
  campus_nodes: string[]            // node_ids of campus-connected nodes
  backbone_uplink_mbps?: number     // Bandwidth to internet backbone
  internal_bandwidth_mbps?: number  // Campus LAN bandwidth
  firewall_rules: FirewallProfile
}

export interface FirewallProfile {
  allows_p2p: boolean               // Peer-to-peer connections between student nodes
  allows_outbound_wireguard: boolean
  allows_inbound_connections: boolean
  blocked_ports: number[]
  allowed_egress_domains: string[]  // Outerim whitelist
}

export interface LatencyMeasurement {
  from_node_id: string
  to_node_id: string
  latency_ms: number
  bandwidth_mbps?: number
  measured_at: string
  method: 'PING' | 'IPERF' | 'ESTIMATE'
}

export interface FabricGroup {
  fabric_id: string
  fabric_type: 'NVLINK' | 'INFINIBAND' | 'PCIE_SWITCH' | 'ETHERNET'
  node_ids: string[]
  gpu_ids: string[]
  aggregate_bandwidth_gbps?: number
}

// ─── Topology Service ─────────────────────────────────────────────────────────

export interface TopologyStore {
  getCampus(campus_id: string): Promise<CampusTopology | null>
  getCampusByInstitution(institution_id: string): Promise<CampusTopology[]>
  saveCampus(campus: CampusTopology): Promise<void>
  saveLatency(measurement: LatencyMeasurement): Promise<void>
  getLatency(from_node_id: string, to_node_id: string): Promise<LatencyMeasurement | null>
  saveFabricGroup(group: FabricGroup): Promise<void>
  getFabricGroupsForNode(node_id: string): Promise<FabricGroup[]>
}

export class AtlasTopologyService {
  private store: TopologyStore

  constructor(store: TopologyStore) {
    this.store = store
  }

  /**
   * Get all campus nodes for an institution.
   * Used by routing engine to prefer same-campus allocation.
   */
  async getInstitutionNodes(institution_id: string): Promise<{
    backbone: string[]
    campus: string[]
  }> {
    const campuses = await this.store.getCampusByInstitution(institution_id)
    return {
      backbone: campuses.flatMap(c => c.backbone_nodes),
      campus:   campuses.flatMap(c => c.campus_nodes),
    }
  }

  /**
   * Determine if two nodes can communicate directly
   * (same campus LAN or via Outerim tunnel).
   */
  async canCommunicate(node_a: AtlasNode, node_b: AtlasNode): Promise<{
    can_communicate: boolean
    method: 'DIRECT' | 'WIREGUARD' | 'BACKBONE' | 'NONE'
    estimated_latency_ms?: number
  }> {
    // Same campus — direct LAN
    if (node_a.campus_id && node_a.campus_id === node_b.campus_id) {
      const latency = await this.store.getLatency(node_a.node_id, node_b.node_id)
      return {
        can_communicate:     true,
        method:              'DIRECT',
        estimated_latency_ms: latency?.latency_ms ?? 1,
      }
    }

    // Both have WireGuard endpoints — mesh tunnel
    if (node_a.tunnel_endpoint && node_b.tunnel_endpoint) {
      const latency = await this.store.getLatency(node_a.node_id, node_b.node_id)
      return {
        can_communicate:     true,
        method:              'WIREGUARD',
        estimated_latency_ms: latency?.latency_ms ?? 20,
      }
    }

    // Both are backbone — routable via internet
    if (
      node_a.supply_tier === SupplyTier.BACKBONE &&
      node_b.supply_tier === SupplyTier.BACKBONE
    ) {
      return {
        can_communicate:     true,
        method:              'BACKBONE',
        estimated_latency_ms: 10,
      }
    }

    // Edge node without tunnel cannot be reached
    if (
      node_a.topology === NetworkTopology.RESIDENTIAL &&
      !node_a.tunnel_endpoint
    ) {
      return { can_communicate: false, method: 'NONE' }
    }

    return { can_communicate: false, method: 'NONE' }
  }

  /**
   * Record a latency measurement between two nodes.
   * Called by Outerim after tunnel establishment.
   */
  async recordLatency(measurement: LatencyMeasurement): Promise<void> {
    await this.store.saveLatency(measurement)
  }

  /**
   * Register a hardware fabric group (NVLink, InfiniBand).
   * Multi-GPU jobs should prefer nodes in the same fabric group.
   */
  async registerFabricGroup(group: FabricGroup): Promise<void> {
    await this.store.saveFabricGroup(group)
  }

  /**
   * Find nodes that share a hardware fabric with the given node.
   * Critical for multi-GPU training jobs requiring NVLink.
   */
  async getFabricPeers(node_id: string): Promise<string[]> {
    const groups = await this.store.getFabricGroupsForNode(node_id)
    const peers = groups
      .flatMap(g => g.node_ids)
      .filter(id => id !== node_id)
    return [...new Set(peers)]
  }

  /**
   * Register a university campus topology.
   * Called during institution onboarding.
   */
  async registerCampus(campus: CampusTopology): Promise<void> {
    await this.store.saveCampus(campus)
  }
}
