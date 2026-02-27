/**
 * @gp4u/db-adapters — In-Memory Sequence Counter
 *
 * Implements custodes-obsidian's SequenceCounter interface.
 *
 * DEVELOPMENT: In-memory atomic counter.
 * PRODUCTION: Swap for RedisSequenceCounter using INCR — Redis guarantees
 *             atomicity across multiple server processes.
 *
 * This counter provides the block_index for every Obsidian ledger entry,
 * ensuring the chain is always gapless and verifiable.
 */

export interface SequenceCounter {
  next(): Promise<number>
}

export class MemorySequenceCounter implements SequenceCounter {
  private value = 0

  async next(): Promise<number> {
    // In a single-process Node.js environment this is safe.
    // In production use Redis INCR for cross-process safety.
    return this.value++
  }

  current(): number {
    return this.value
  }
}
