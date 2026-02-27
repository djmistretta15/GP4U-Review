/**
 * CUSTODES ATLAS — Public API
 *
 * Import surface for all other modules:
 *   import { AtlasRoutingEngine, AtlasRegistryService, SupplyTier } from '@custodes/atlas'
 */

// Core types
export type {
  AtlasNode,
  AtlasGPU,
  GPUTelemetry,
  GPUAllocation,
  DiscoveryCriteria,
  DiscoveryResult,
  RoutingDecision,
  AtlasConfig,
  AtlasNodeStore,
  AtlasGPUStore,
  AtlasAllocationStore,
  RegisterNodeRequest,
  RegisterGPURequest,
  AtlasObsidianSink,
} from './types'

export {
  SupplyTier,
  GPUTier,
  NodeStatus,
  NetworkTopology,
  PriceMode,
  AllocationStatus,
  RoutingStrategy,
} from './types'

// Services
export { AtlasRegistryService }     from './registry-service'
export { AtlasRoutingEngine }       from './routing-engine'
export { AtlasTopologyService }     from './topology-service'

export type {
  CampusTopology,
  FirewallProfile,
  LatencyMeasurement,
  FabricGroup,
  TopologyStore,
} from './topology-service'
