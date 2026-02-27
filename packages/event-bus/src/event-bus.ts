/**
 * @gp4u/event-bus — Platform Event Bus
 *
 * This is the telemetry spine of the entire platform.
 * Every module publishes here. Every chamber subscribes here.
 *
 * Bulkhead design:
 *   - Publishers never know who is subscribed. If a chamber crashes,
 *     the publisher keeps running. The dead chamber's handler is caught
 *     and logged — it never propagates up.
 *   - Chambers can be attached and detached at runtime without restarts.
 *   - The bus can be backed by in-process EventEmitter (dev/small deployments)
 *     or Redis pub/sub (production) without changing any module code.
 *
 * Ship analogy: publishing is putting a message in the intercom system.
 * If a compartment's speaker is broken, the ship doesn't sink.
 */

import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import type { PlatformEvent, PlatformEventType } from '@gp4u/types'

// ─── Subscription Handle ──────────────────────────────────────────────────────

export interface Subscription {
  id: string
  subscriber_id: string
  event_types: PlatformEventType[]
  unsubscribe(): void
}

// ─── Bus Stats ────────────────────────────────────────────────────────────────

export interface BusStats {
  events_published: number
  events_delivered: number
  events_dropped: number      // Handler errors caught by bulkhead
  active_subscriptions: number
  subscriber_ids: string[]
}

// ─── Handler type ─────────────────────────────────────────────────────────────

export type EventHandler<T extends PlatformEvent = PlatformEvent> = (
  event: T
) => Promise<void>

// ─── Event Bus ────────────────────────────────────────────────────────────────

export class GP4UEventBus {
  private emitter = new EventEmitter()
  private subscriptions = new Map<string, { subscriber_id: string; types: Set<PlatformEventType> }>()
  private stats: BusStats = {
    events_published: 0,
    events_delivered: 0,
    events_dropped: 0,
    active_subscriptions: 0,
    subscriber_ids: [],
  }

  constructor() {
    // Allow many chambers to subscribe without Node.js warnings
    this.emitter.setMaxListeners(100)
  }

  /**
   * Publish an event to all subscribed handlers.
   *
   * The publisher fire-and-forgets. Each handler runs independently.
   * A failing handler is caught — the bulkhead holds.
   */
  async publish<T extends PlatformEvent>(event: T): Promise<void> {
    this.stats.events_published++

    // Emit to type-specific handlers
    const handlers = this.emitter.rawListeners(event.type) as EventHandler<T>[]

    await Promise.allSettled(
      handlers.map(async (handler) => {
        try {
          await handler(event)
          this.stats.events_delivered++
        } catch (err) {
          // BULKHEAD: one failing subscriber never brings down others
          this.stats.events_dropped++
          console.error(
            `[event-bus] Handler for ${event.type} from subscriber threw:`,
            err instanceof Error ? err.message : err
          )
        }
      })
    )
  }

  /**
   * Subscribe to one or more event types.
   * Returns a handle with an unsubscribe() method — the docking latch.
   */
  subscribe<T extends PlatformEvent>(
    subscriber_id: string,
    event_types: T['type'][],
    handler: EventHandler<T>
  ): Subscription {
    const sub_id = uuidv4()

    for (const type of event_types) {
      this.emitter.on(type, handler as EventHandler)
    }

    this.subscriptions.set(sub_id, {
      subscriber_id,
      types: new Set(event_types as PlatformEventType[]),
    })

    this.stats.active_subscriptions++
    if (!this.stats.subscriber_ids.includes(subscriber_id)) {
      this.stats.subscriber_ids.push(subscriber_id)
    }

    return {
      id: sub_id,
      subscriber_id,
      event_types: event_types as PlatformEventType[],
      unsubscribe: () => {
        for (const type of event_types) {
          this.emitter.off(type, handler as EventHandler)
        }
        this.subscriptions.delete(sub_id)
        this.stats.active_subscriptions--
      },
    }
  }

  /**
   * Convenience: subscribe to ALL platform events.
   * Used by Obsidian — it logs everything.
   */
  subscribeAll(
    subscriber_id: string,
    handler: EventHandler<PlatformEvent>
  ): Subscription {
    return this.subscribe(subscriber_id, ['*' as PlatformEventType], handler)
  }

  getStats(): BusStats {
    return { ...this.stats }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
// One bus per process. In production, swap internals for Redis pub/sub.

let _bus: GP4UEventBus | null = null

export function getEventBus(): GP4UEventBus {
  if (!_bus) _bus = new GP4UEventBus()
  return _bus
}
