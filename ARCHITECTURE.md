# GP4U Platform Architecture

## Module Map

```
┌─────────────────────────────────────────────────────────────────┐
│                        GP4U PLATFORM                            │
│                                                                 │
│  apps/web  (Next.js 15 — the marketplace, dashboard, jobs)      │
│    │                                                            │
│    ├── @gp4u/platform-core  ──── bootstrap.ts  (startup wiring) │
│    │                        ──── middleware.ts  (Custodes gate)  │
│    │                                                            │
│    └── @gp4u/event-bus  ─────── publisher.ts   (emit events)   │
│                          ──────  event-bus.ts   (bulkhead spine) │
└──────────────────────┬──────────────────────────────────────────┘
                       │  PlatformEvent (typed)
          ┌────────────▼────────────┐
          │   @gp4u/event-bus       │  ← Every module publishes here
          │   (Telemetry Spine)     │    Every chamber subscribes here
          └────────────┬────────────┘    Failing handlers never sink the bus
                       │
        ┌──────────────┼──────────────────────┐
        │              │                      │
        ▼              ▼                      ▼
  CUSTODES          CHAMBERS           RUSSIAN-DOLL
  (Trust Layer)     (Data Accumulators) (Scheduler)
        │              │                      │
        ├─ Dextera      ├─ Aetherion           └─ Runs on provider GPU
        │  (Identity)   │  (Latency)              VirtualChipScheduler
        │               │                         emits energy.consumed
        ├─ Atlas         ├─ Mnemo                  + job.completed events
        │  (Routing)    │  (Memory)
        │               │
        ├─ Obsidian      ├─ Outerim
        │  (Ledger)     │  (Edge)
        │               │
        ├─ Aedituus      ├─ Energy Broker
        │  (Policy)     │
        │               ├─ Veritas Grid
        └─ Tutela        │  (Provenance)
           (Threats)    │
                        └─ Mist Inc.
                           (Energy Arb)
```

## Package Dependency Graph

```
@gp4u/types          ← no dependencies (the foundation)
@gp4u/event-bus      ← @gp4u/types
@gp4u/db-adapters    ← @gp4u/types, @prisma/client
@gp4u/chamber-registry ← @gp4u/types, @gp4u/event-bus
@gp4u/platform-core  ← all of the above

custodes-dextera     ← @gp4u/types (jose, uuid)
custodes-atlas       ← @gp4u/types
custodes-obsidian    ← @gp4u/types
custodes-aedituus    ← @gp4u/types
custodes-tutela      ← @gp4u/types

apps/web             ← @gp4u/platform-core, @prisma/client
chambers/*           ← @gp4u/types, @gp4u/event-bus
```

## Bulkhead Rules (Ship Doors)

| If this fails...      | Effect                                    | Recovery              |
|-----------------------|-------------------------------------------|-----------------------|
| Any chamber           | Platform runs without that chamber        | Re-dock when repaired |
| Event bus handler     | Error is caught, other handlers continue  | Automatic             |
| Dextera (auth)        | All API routes return 401 (fail-closed)   | Restart Dextera       |
| Aedituus (policy)     | All routes return 503 (fail-closed)       | Restart Aedituus      |
| Atlas (routing)       | Fall back to static GPU list              | Restart Atlas         |
| Obsidian (ledger)     | Events still flow, logging paused         | Events replay on reconnect |
| Tutela (threats)      | Platform keeps running, alerts paused     | Restart Tutela        |
| Russian-Doll agent    | Job fails, GPU released, job re-queued    | Agent restart         |

## Chamber Lifecycle

```
OFFLINE ──dock()──► PASSIVE ──runBacktestAndActivate()──► ACTIVE
                       │                                     │
                       ◄─────────── setMode('PASSIVE') ──────┘
                                   (maintenance / degraded)
```

**PASSIVE**: Receives all subscribed events, stores telemetry. Never influences routing.
**BACKTEST**: Replays stored telemetry, computes improvement score. Score ≥ 70 → ACTIVE.
**ACTIVE**: Publishes `ChamberInfluence` payloads consumed by routing/pricing/policy.
**OFFLINE**: Unsubscribed from bus. Health check re-docks when chamber recovers.

## Event Flow (Full Example: User Submits a Job)

```
User POST /api/jobs
  │
  ├─► middleware.ts          Dextera.verify(token) → passport
  │                          Aedituus.authorize(passport, action=JOB_CREATE)
  │
  ├─► /api/jobs/route.ts     Create Job in DB
  │                          publishJobCreated(event)   ← event bus
  │                               │
  │                    ┌──────────┼──────────────┐
  │                    ▼          ▼              ▼
  │              Obsidian     Aetherion        Mnemo
  │              (log it)     (note route      (note VRAM
  │                            candidate)       demand)
  │
  ├─► Atlas.route()          Select best GPU (uses Aetherion influence if ACTIVE)
  │                          publishJobStarted(event)
  │
  └─► Russian-Doll agent     Executes job on GPU
                             publishJobCompleted(event) + publishEnergyConsumed(event)
                                  │
                       ┌──────────┼──────────┐
                       ▼          ▼          ▼
                  Obsidian    Energy       Veritas
                  (seal it)   (log kWh)   (provenance)
```

## File Structure

```
gp4u-platform/
├── apps/
│   └── web/                       GP4U Next.js app
├── packages/
│   ├── types/                     @gp4u/types — shared event + chamber types
│   ├── event-bus/                 @gp4u/event-bus — telemetry spine
│   ├── db-adapters/               @gp4u/db-adapters — Prisma + memory stores
│   ├── chamber-registry/          @gp4u/chamber-registry — dock/undock system
│   └── platform-core/             @gp4u/platform-core — bootstrap + middleware
│       └── migrations/            Prisma schema additions (copy to apps/web/prisma)
├── chambers/
│   ├── aetherion/                 (build next)
│   ├── mnemo/                     (build next)
│   ├── outerim/                   (build next)
│   ├── energy/                    (build next)
│   ├── veritas/                   (build next)
│   └── mist/                      (build next)
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```
