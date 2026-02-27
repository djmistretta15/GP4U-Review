/**
 * CUSTODES OBSIDIAN — Public API
 *
 * Import surface for all other modules:
 *   import { ObsidianLedgerService, ObsidianEmitter, LedgerEventType } from '@custodes/obsidian'
 */

// Core types
export type {
  LedgerEntry,
  MerkleBlock,
  MerkleProof,
  Dispute,
  EvidencePackage,
  CommitEventRequest,
  CommitEventResponse,
  VerifyChainRequest,
  VerifyChainResponse,
  LedgerQuery,
  LedgerQueryResult,
  ObsidianConfig,
  LedgerStore,
  SequenceCounter,
} from './types'

export {
  LedgerEventType,
  LedgerEventSeverity,
  DisputeReason,
  DisputeStatus,
  DisputeOutcome,
} from './types'

// Ledger service
export { ObsidianLedgerService } from './ledger-service'

// Event emitter (used by all pillars + chambers)
export { ObsidianEmitter } from './event-emitter'

// Hash chain utilities (exposed for external verification)
export {
  computePayloadHash,
  computeBlockHash,
  verifyChain,
  verifyMerkleProof,
  buildMerkleTree,
  GENESIS_HASH,
  sha256,
} from './hash-chain'
