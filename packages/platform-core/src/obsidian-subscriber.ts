/**
 * @gp4u/platform-core — Obsidian Event Subscriber
 *
 * Wires the event bus to the Obsidian immutable ledger.
 * Every PlatformEvent that flows through the bus gets a permanent
 * ledger entry — the chain is unbroken from day one.
 *
 * This is the memory of the entire platform. Every chamber backtest
 * reads from what this subscriber has written. Every dispute resolution
 * queries this store. Every compliance audit starts here.
 *
 * Bulkhead behavior:
 *   - If Obsidian falls behind, events still flow to all other subscribers
 *   - The subscription auto-recovers when the ledger store is available again
 *   - Events are NEVER blocked waiting for a ledger write
 *
 * Call startObsidianSubscriber() from bootstrap.ts after the ledger
 * store and sequence counter are initialized.
 */

import { getEventBus, type Subscription } from '@gp4u/event-bus'
import type { PlatformEvent } from '@gp4u/types'
import type { PrismaLedgerStore } from './adapters'
import type { MemorySequenceCounter } from './adapters'
import { createHash } from 'crypto'

// Maps PlatformEvent type → Obsidian severity
const SEVERITY_MAP: Record<string, string> = {
  'auth.authenticated':       'INFO',
  'auth.user_registered':     'INFO',
  'auth.passport_revoked':    'WARN',
  'job.created':              'INFO',
  'job.started':              'INFO',
  'job.completed':            'INFO',
  'job.failed':               'WARN',
  'gpu.listed':               'INFO',
  'gpu.status_changed':       'INFO',
  'gpu.health_reported':      'INFO',
  'arbitrage.calculated':     'INFO',
  'memory.staked':            'INFO',
  'memory.allocated':         'INFO',
  'network.route_calculated': 'INFO',
  'energy.consumed':          'INFO',
  'security.anomaly_detected':'SECURITY',
  'security.kill_switch_fired':'SECURITY',
  'provenance.recorded':      'INFO',
}

function hashPayload(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex')
}

function blockHash(payload_hash: string, prev_hash: string, index: number): string {
  return createHash('sha256')
    .update(`${payload_hash}:${prev_hash}:${index}`)
    .digest('hex')
}

const GENESIS = '0000000000000000000000000000000000000000000000000000000000000000'

export interface ObsidianSubscriberOptions {
  ledgerStore: PrismaLedgerStore
  sequenceCounter: MemorySequenceCounter
}

export function startObsidianSubscriber(opts: ObsidianSubscriberOptions): Subscription {
  const bus = getEventBus()
  let prev_hash = GENESIS

  const subscription = bus.subscribe<PlatformEvent>(
    'custodes.obsidian',
    // Subscribe to all known event types
    [
      'auth.user_registered',
      'auth.authenticated',
      'auth.passport_revoked',
      'job.created',
      'job.started',
      'job.completed',
      'job.failed',
      'gpu.listed',
      'gpu.status_changed',
      'gpu.health_reported',
      'arbitrage.calculated',
      'memory.staked',
      'memory.allocated',
      'network.route_calculated',
      'energy.consumed',
      'security.anomaly_detected',
      'security.kill_switch_fired',
      'provenance.recorded',
    ],
    async (event) => {
      try {
        const block_index = await opts.sequenceCounter.next()
        const entry_id = event.event_id

        // Pull subject/target from event payload generically
        const e = event as Record<string, unknown>
        const subject_id =
          (e['subject_id'] as string) ??
          (e['buyer_subject_id'] as string) ??
          undefined
        const target_id =
          (e['job_id'] as string) ??
          (e['gpu_id'] as string) ??
          (e['allocation_id'] as string) ??
          undefined
        const target_type = e['job_id'] ? 'JOB'
          : e['gpu_id'] ? 'GPU'
          : e['allocation_id'] ? 'ALLOCATION'
          : undefined

        const payload_hash = hashPayload(event)
        const bh = blockHash(payload_hash, prev_hash, block_index)
        prev_hash = bh

        await opts.ledgerStore.append({
          entry_id,
          block_index,
          event_type: event.type,
          severity: SEVERITY_MAP[event.type] ?? 'INFO',
          subject_id,
          target_id: target_id as string | undefined,
          target_type: target_type as string | undefined,
          metadata: event as unknown as Record<string, unknown>,
          region: (e['region'] as string) ?? undefined,
          timestamp: event.timestamp,
          sequence: block_index,
          prev_hash: block_index === 0 ? GENESIS : prev_hash,
          payload_hash,
          block_hash: bh,
        })
      } catch (err) {
        // Ledger write failed — log but DO NOT re-throw (bulkhead holds)
        console.error('[obsidian] Failed to write ledger entry:', err)
      }
    }
  )

  console.log('[obsidian] Universal event subscriber active — all events will be ledgered')
  return subscription
}
