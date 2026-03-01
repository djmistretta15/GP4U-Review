# GP4U — Platform Documentation

> **GPU For You** — The trust-layer for the distributed compute economy.

---

## What Is GP4U?

GP4U is a decentralized GPU compute marketplace that solves the problem every AI researcher, startup, and enterprise faces: **getting access to the right GPU hardware at the right price, with the right guarantees.**

The fundamental insight: there are more idle GPUs in the world than there are jobs to run on them. University research clusters sit at 30% utilization overnight. Mining farms are going offline. Gaming cafes have hundreds of RTX 4090s doing nothing at 3am. Meanwhile, AI teams are waiting days for cloud spot capacity.

GP4U connects supply to demand — but unlike every marketplace before it, **trust is the product.**

We do not simply broker hardware. We verify it, monitor it, audit every transaction on an immutable ledger, and issue cryptographic proofs that the compute you paid for is the compute you got. When something goes wrong, there is a documented slash record, an appeal process, and a public trail that can never be altered.

This is the platform for the next age of compute. Not because it is the cheapest — though it will be. Not because it is the fastest — though it will be. Because it is the one you can **trust with your most important work.**

---

## Documentation Index

| Document | What It Covers |
|---|---|
| [Architecture](./architecture.md) | System design, module map, event flow, chamber lifecycle |
| [Job Pipeline](./pipeline.md) | End-to-end job lifecycle from submission to completion |
| [Staking & Slashing](./staking-and-slashing.md) | Mnemo engine — stake tiers, slash conditions, appeals |
| [ZK Attestation](./zk-attestation.md) | Zero-knowledge proofs for hardware, energy, and uptime |
| [Security Model](./security.md) | Auth, rate limiting, CORS, visibility T&C, threat detection |
| [Provider Guide](./provider-guide.md) | University and commercial onboarding, install, earnings |
| [Customer Guide](./customer-guide.md) | Account setup, submitting jobs, clusters, memory staking |
| [Chambers Reference](./chambers.md) | All six chambers — what they do and how they interact |
| [API Reference](./api-reference.md) | All API routes with request/response schemas |
| [Roadmap](./roadmap.md) | Where the platform is going — near term and long term |

---

## Platform At a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│                         GP4U PLATFORM                               │
│                                                                      │
│   Customer              Web Platform             Provider           │
│   ─────────             ────────────             ────────           │
│   CLI / Web  ──────▶   Next.js App    ◀──────   Agent Daemon       │
│   Job Submit           API Routes                GPU Discovery      │
│   Arbitrage            Chamber Bus               Job Execution      │
│   Memory Stake         Obsidian Ledger           Telemetry Stream   │
│   QR Invite            ZK Proof Registry         Slash/Appeal       │
│                              │                                      │
│                         ┌────▼────┐                                 │
│                         │ 6 Chambers                                │
│                         │ Mnemo     — Memory & Staking              │
│                         │ Aetherion — Latency Routing               │
│                         │ Energy    — Carbon & Efficiency           │
│                         │ Veritas   — Data Provenance               │
│                         │ Outerim   — Edge Marketplace              │
│                         │ Mist      — Price Arbitrage               │
│                         └─────────┘                                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Core Philosophy

**1. Trust Through Transparency, Not Promises**
Every provider installs an agent that grants GP4U full hardware visibility as a condition of joining. There is no opt-out. Sketchy actors will not agree to these terms — and that is the point. The consent requirement *is* the filter.

**2. Truth Is Non-Negotiable**
Every job, slash, appeal, and proof is written to the Obsidian ledger — a hash-chained, append-only audit trail. Nothing is ever deleted. Nothing is ever altered. When something goes wrong, the record is there. Forever.

**3. ZK Proofs Over Blind Trust**
We do not ask customers to trust our reporting. Hardware attestation, energy consumption, and uptime are proven cryptographically using zero-knowledge proofs. A customer can verify that a job ran on the declared GPU without the provider ever revealing whose job it was.

**4. University Network as Foundation**
The first provider network is the university GPU ecosystem — research clusters, CS department labs, idle student hardware. Universities have reputational skin in the game. Their brand IS their stake. This creates a clean, high-integrity supply base before any commercial expansion.

**5. Students Benefit**
A portion of every compute transaction processed through university hardware flows back to student programs at that institution. GP4U is not just a marketplace — it is infrastructure for the next generation of researchers.
