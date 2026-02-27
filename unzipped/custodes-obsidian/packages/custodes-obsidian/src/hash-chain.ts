/**
 * CUSTODES OBSIDIAN — Hash Chain Engine
 *
 * Implements the cryptographic backbone of the ledger.
 * Uses SHA-256 for entry hashing and a Merkle tree
 * for block-level commitment and proof generation.
 *
 * The chain works like this:
 *   entry[0].block_hash = SHA256(payload_hash + "GENESIS" + 0)
 *   entry[1].block_hash = SHA256(payload_hash + entry[0].block_hash + 1)
 *   entry[N].block_hash = SHA256(payload_hash + entry[N-1].block_hash + N)
 *
 * Tampering with entry[K] changes block_hash[K], which invalidates
 * block_hash[K+1]...block_hash[N]. Detection is O(N) scan.
 */

import { createHash } from 'crypto'
import { LedgerEntry, MerkleBlock, MerkleProof } from './types'

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000'

// ─── Entry Hashing ────────────────────────────────────────────────────────────

/**
 * Compute the canonical payload hash for a ledger entry.
 * This hash commits to all meaningful fields (excludes the hash fields themselves).
 */
export function computePayloadHash(entry: Omit<LedgerEntry, 'payload_hash' | 'block_hash' | 'prev_hash' | 'merkle_root'>): string {
  const canonical = JSON.stringify({
    entry_id:         entry.entry_id,
    block_index:      entry.block_index,
    event_type:       entry.event_type,
    severity:         entry.severity,
    subject_id:       entry.subject_id,
    passport_id:      entry.passport_id ?? null,
    institution_id:   entry.institution_id ?? null,
    target_id:        entry.target_id ?? null,
    target_type:      entry.target_type ?? null,
    metadata:         entry.metadata,
    ip_address_hash:  entry.ip_address_hash,
    region:           entry.region ?? null,
    timestamp:        entry.timestamp,
    sequence:         entry.sequence,
  })

  return sha256(canonical)
}

/**
 * Compute the block hash — this is the chain link.
 * Changes to payload_hash or prev_hash invalidate this hash.
 */
export function computeBlockHash(
  payload_hash: string,
  prev_hash: string,
  block_index: number
): string {
  return sha256(`${payload_hash}:${prev_hash}:${block_index}`)
}

/**
 * Hash a raw IP address for privacy-safe storage.
 */
export function hashIPAddress(ip: string): string {
  return sha256(ip)
}

// ─── Chain Verification ───────────────────────────────────────────────────────

export interface ChainVerificationResult {
  valid: boolean
  entries_checked: number
  first_invalid_index?: number
  error?: string
}

/**
 * Verify the integrity of a sequence of ledger entries.
 * Each entry's block_hash must match recomputed value from its payload + prev_hash.
 */
export function verifyChain(entries: LedgerEntry[]): ChainVerificationResult {
  if (entries.length === 0) {
    return { valid: true, entries_checked: 0 }
  }

  // Sort by block_index to ensure correct order
  const sorted = [...entries].sort((a, b) => a.block_index - b.block_index)

  for (let i = 0; i < sorted.length; i++) {
    const entry = sorted[i]

    // Recompute payload hash
    const expected_payload_hash = computePayloadHash(entry)
    if (entry.payload_hash !== expected_payload_hash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid_index: entry.block_index,
        error: `Payload hash mismatch at block ${entry.block_index}`,
      }
    }

    // Determine expected prev_hash
    const expected_prev_hash = i === 0
      ? (entry.prev_hash)  // First entry in range — accept its prev_hash as given
      : sorted[i - 1].block_hash

    // Recompute block hash
    const expected_block_hash = computeBlockHash(
      entry.payload_hash,
      expected_prev_hash,
      entry.block_index
    )

    if (entry.block_hash !== expected_block_hash) {
      return {
        valid: false,
        entries_checked: i + 1,
        first_invalid_index: entry.block_index,
        error: `Block hash mismatch at block ${entry.block_index}`,
      }
    }
  }

  return { valid: true, entries_checked: sorted.length }
}

// ─── Merkle Tree ──────────────────────────────────────────────────────────────

/**
 * Build a Merkle tree from an array of leaf hashes.
 * Returns the root hash and the full tree (for proof generation).
 *
 * Tree structure (bottom-up):
 *   Level 0 (leaves): [h0, h1, h2, h3, ...]
 *   Level 1:          [hash(h0+h1), hash(h2+h3), ...]
 *   ...
 *   Root:             single hash
 */
export function buildMerkleTree(leaf_hashes: string[]): {
  root: string
  tree: string[][]
} {
  if (leaf_hashes.length === 0) {
    return { root: GENESIS_HASH, tree: [] }
  }

  const tree: string[][] = [leaf_hashes]
  let current_level = leaf_hashes

  while (current_level.length > 1) {
    const next_level: string[] = []
    for (let i = 0; i < current_level.length; i += 2) {
      const left = current_level[i]
      const right = current_level[i + 1] ?? left  // Duplicate last if odd
      next_level.push(sha256(left + right))
    }
    tree.push(next_level)
    current_level = next_level
  }

  return {
    root: current_level[0],
    tree,
  }
}

/**
 * Generate a Merkle proof for a specific leaf.
 * The proof is a path of sibling hashes from leaf to root.
 * Anyone with the root can verify the proof without the full tree.
 */
export function generateMerkleProof(
  leaf_index: number,
  tree: string[][]
): string[] {
  const proof: string[] = []
  let index = leaf_index

  for (let level = 0; level < tree.length - 1; level++) {
    const current_level = tree[level]
    const is_right_child = index % 2 === 1
    const sibling_index = is_right_child ? index - 1 : index + 1

    if (sibling_index < current_level.length) {
      proof.push(current_level[sibling_index])
    } else {
      // Duplicate last node
      proof.push(current_level[index])
    }

    index = Math.floor(index / 2)
  }

  return proof
}

/**
 * Verify a Merkle proof for a single leaf.
 * Returns true if the leaf is part of the tree with the given root.
 */
export function verifyMerkleProof(
  leaf_hash: string,
  leaf_index: number,
  proof_path: string[],
  merkle_root: string
): boolean {
  let current = leaf_hash
  let index = leaf_index

  for (const sibling of proof_path) {
    const is_right_child = index % 2 === 1
    current = is_right_child
      ? sha256(sibling + current)
      : sha256(current + sibling)
    index = Math.floor(index / 2)
  }

  return current === merkle_root
}

/**
 * Seal a block of entries into a MerkleBlock.
 * Called every N entries (default: 100).
 */
export function sealMerkleBlock(
  entries: LedgerEntry[],
  block_number: number,
  instance_id: string
): Omit<MerkleBlock, 'signature'> {
  const leaf_hashes = entries.map(e => e.block_hash)
  const { root } = buildMerkleTree(leaf_hashes)

  return {
    block_number,
    entry_start: entries[0].block_index,
    entry_end:   entries[entries.length - 1].block_index,
    entry_hashes: leaf_hashes,
    merkle_root: root,
    sealed_at: new Date().toISOString(),
    sealed_by: instance_id,
  }
}

// ─── Utility ──────────────────────────────────────────────────────────────────

export function sha256(data: string): string {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}
