/**
 * GP4U Glossary
 * =============
 * Central dictionary of every piece of jargon a user encounters on the platform.
 * Every term gets a plain-English definition and a docs link.
 *
 * Usage:
 *   import { GLOSSARY } from '@/components/ui/glossary'
 *   const def = GLOSSARY['VRAM']  // → { term, definition, docPath, category }
 *
 * The InfoTooltip component uses this automatically:
 *   <Info term="VRAM" />
 */

export interface GlossaryEntry {
  term:        string      // Display name (may differ from key)
  definition:  string      // Plain English, 1-3 sentences, no jargon
  docPath?:    string      // Path to docs page (e.g. '/docs/staking')
  category:    GlossaryCategory
}

export type GlossaryCategory =
  | 'compute'    // GPU, VRAM, job, cluster
  | 'finance'    // stake, slash, yield, arbitrage
  | 'trust'      // ZK proof, Obsidian, Veritas, attestation
  | 'chambers'   // Mnemo, Aetherion, etc.
  | 'platform'   // auth, clearance, provider, node
  | 'energy'     // carbon, kWh, renewable

export const GLOSSARY: Record<string, GlossaryEntry> = {

  // ── Compute ────────────────────────────────────────────────────────────────

  VRAM: {
    term:       'VRAM',
    definition: 'Video RAM — the memory on a GPU chip. AI models live here during training and inference. More VRAM means larger models and bigger batch sizes. A typical LLaMA 7B model at bf16 needs ~28GB of VRAM to train.',
    docPath:    '/docs/pipeline#vram',
    category:   'compute',
  },
  GPU: {
    term:       'GPU',
    definition: 'Graphics Processing Unit — hardware originally designed for rendering graphics, now the standard tool for AI and machine learning. Its thousands of parallel cores are ideal for matrix operations used in deep learning.',
    category:   'compute',
  },
  Job: {
    term:       'Job',
    definition: 'A single compute task that runs inside a secured Docker container on a provider\'s GPU. You define the workload, duration, and resource requirements. The platform matches you with the best available hardware.',
    docPath:    '/docs/pipeline',
    category:   'compute',
  },
  Cluster: {
    term:       'Cluster',
    definition: 'A group of multiple GPUs reserved together for one job. Use clusters when a single GPU doesn\'t have enough VRAM, or when distributed training can split work across multiple devices.',
    docPath:    '/docs/pipeline#clusters',
    category:   'compute',
  },
  WorkloadType: {
    term:       'Workload Type',
    definition: 'The category of compute your job performs: TRAINING (teaching a model from scratch), FINE_TUNING (adapting a pre-trained model), INFERENCE (running a model to produce results), or DATA_PROCESSING. This affects routing and pricing.',
    category:   'compute',
  },
  TFLOPS: {
    term:       'TFLOPS',
    definition: 'Trillion Floating Point Operations Per Second — how fast a GPU can do math. An A100 delivers ~77 TFLOPS for AI workloads; an H100 delivers ~200 TFLOPS. More TFLOPS means faster training.',
    category:   'compute',
  },
  bf16: {
    term:       'bf16 (bfloat16)',
    definition: 'A 16-bit floating point format optimized for AI training. It uses 2 bytes per number instead of fp32\'s 4 bytes, halving VRAM requirements while maintaining good numeric stability. The default precision for most modern AI training.',
    category:   'compute',
  },
  fp16: {
    term:       'fp16',
    definition: 'Half-precision floating point — 2 bytes per value, half the VRAM of fp32. Widely supported but can have numeric stability issues. Generally use bf16 instead for training.',
    category:   'compute',
  },

  // ── Finance / Staking ──────────────────────────────────────────────────────

  Stake: {
    term:       'Stake',
    definition: 'Something a provider puts at risk to guarantee their commitment. University providers stake their reputation — a public slash record damages their standing. Commercial providers stake cash (held in escrow). If they misbehave, they lose some or all of their stake.',
    docPath:    '/docs/staking-and-slashing',
    category:   'finance',
  },
  Slash: {
    term:       'Slash',
    definition: 'A penalty applied when a provider violates platform rules — for example, running more VRAM than declared, dropping a job, or blocking monitoring. Slashes are recorded permanently on the Obsidian ledger. Soft slashes deduct a percentage of stake; hard slashes result in ejection.',
    docPath:    '/docs/staking-and-slashing#slash-conditions',
    category:   'finance',
  },
  Arbitrage: {
    term:       'Arbitrage',
    definition: 'Taking advantage of price differences across cloud providers. The same A100 GPU might cost $3.20/hr on AWS but $2.10/hr on RunPod. GP4U tracks these differences in real time and routes your jobs to the best value option.',
    docPath:    '/docs/pipeline#arbitrage',
    category:   'finance',
  },
  Yield: {
    term:       'Yield',
    definition: 'Passive earnings from staking idle VRAM or RAM. When your hardware isn\'t running a job, you can offer that memory capacity to other jobs and earn a per-GB-per-second rate.',
    docPath:    '/docs/staking-and-slashing',
    category:   'finance',
  },
  Escrow: {
    term:       'Escrow',
    definition: 'Commercial provider stakes are held in a locked account (escrow) and can only be released when the provider exits cleanly with no pending slashes or open appeals. This ensures the stake is always available to cover penalties.',
    category:   'finance',
  },
  Appeal: {
    term:       'Appeal',
    definition: 'A formal challenge to a slash event. Providers can file an appeal within 7 days (soft slash) or 14 days (hard slash) with evidence. The original slash remains on the permanent ledger, but an accepted appeal adds a reversal entry and restores the stake.',
    docPath:    '/docs/staking-and-slashing#appeals',
    category:   'finance',
  },

  // ── Trust & Verification ───────────────────────────────────────────────────

  ZKProof: {
    term:       'ZK Proof (Zero-Knowledge Proof)',
    definition: 'A cryptographic proof that a statement is true without revealing the underlying data. GP4U uses ZK proofs to verify hardware specs, energy consumption, and uptime — so you can confirm what ran on what hardware without anyone revealing private job details.',
    docPath:    '/docs/zk-attestation',
    category:   'trust',
  },
  HardwareAttestation: {
    term:       'Hardware Attestation',
    definition: 'A cryptographic proof that a job ran on specific declared hardware (e.g. an NVIDIA RTX 4090 with 24GB VRAM). Generated by the provider agent after job completion using the RISC Zero zkVM. You can verify this proof independently without trusting GP4U.',
    docPath:    '/docs/zk-attestation#hardware',
    category:   'trust',
  },
  EnergyAttestation: {
    term:       'Energy Attestation',
    definition: 'A cryptographic proof of how much electricity a job consumed, and what percentage came from renewable sources. This is the foundation for issuing carbon credits — verifiable by third-party registries like Gold Standard without seeing job data.',
    docPath:    '/docs/zk-attestation#energy',
    category:   'trust',
  },
  UptimeAttestation: {
    term:       'Uptime Attestation',
    definition: 'A cryptographic proof of a provider\'s reliability over time — what percentage of time their hardware was available, how many jobs completed vs failed. Used to calculate the Veritas tier badge (Gold, Silver, Bronze).',
    docPath:    '/docs/zk-attestation#uptime',
    category:   'trust',
  },
  ObsidianLedger: {
    term:       'Obsidian Ledger',
    definition: 'GP4U\'s immutable, append-only audit trail. Every job, slash, appeal, ZK proof, and financial transaction is recorded here as a hash-chained block. Nothing is ever deleted or altered. Think of it as the permanent paper trail for every action on the platform.',
    docPath:    '/docs/architecture#obsidian',
    category:   'trust',
  },
  MerkleRoot: {
    term:       'Merkle Root',
    definition: 'A cryptographic fingerprint of a set of ledger entries. After every 100 entries, a Merkle root is calculated and sealed. If any entry is tampered with, the root changes — making tampering detectable. This is how the Obsidian ledger proves its own integrity.',
    category:   'trust',
  },
  VeritasTier: {
    term:       'Veritas Tier',
    definition: 'A reliability badge (Gold, Silver, Bronze) issued to providers based on cryptographically-attested uptime. Gold = 99.5%+ uptime. Used by the routing system to prefer reliable providers for important jobs. Earned, not purchased.',
    docPath:    '/docs/zk-attestation#uptime',
    category:   'trust',
  },
  TrustScore: {
    term:       'Trust Score',
    definition: 'A numeric score (0–1) reflecting a provider\'s reliability based on slash history, uptime percentage, completed jobs, and ZK proof submissions. Higher trust score means more job routing priority and lower risk premium for customers.',
    category:   'trust',
  },
  ClearanceLevel: {
    term:       'Clearance Level',
    definition: 'Your account\'s permission tier. EMAIL_ONLY (basic account), INSTITUTIONAL (verified institution), ENTERPRISE (enterprise agreement), ADMIN (platform administrator). Higher clearance unlocks admin tools, higher rate limits, and priority routing.',
    category:   'platform',
  },

  // ── Chambers ───────────────────────────────────────────────────────────────

  Chamber: {
    term:       'Chamber',
    definition: 'One of six specialized intelligence modules that observe platform events and, when active, influence how jobs are routed. Chambers learn from data over time — starting in passive mode, then backtesting, then going active. Like a brain region that specialises in one thing.',
    docPath:    '/docs/chambers',
    category:   'chambers',
  },
  Mnemo: {
    term:       'Mnemo Chamber',
    definition: 'The memory and staking chamber. Manages VRAM/RAM staking, tracks memory demand signals, and runs the stake/slash engine. When active, it routes jobs toward providers with staked memory capacity.',
    docPath:    '/docs/chambers#mnemo',
    category:   'chambers',
  },
  Aetherion: {
    term:       'Aetherion Chamber',
    definition: 'The network routing chamber. Tracks latency between job origins and GPU regions, and routes jobs toward low-latency providers. Also handles carbon intensity tracking for each region.',
    docPath:    '/docs/chambers#aetherion',
    category:   'chambers',
  },
  EnergyBroker: {
    term:       'Energy Broker Chamber',
    definition: 'Correlates compute jobs with energy consumption data. Identifies which regions and providers have the lowest carbon intensity. When active, it biases routing toward greener compute options.',
    docPath:    '/docs/chambers#energy',
    category:   'chambers',
  },
  Veritas: {
    term:       'Veritas Chamber',
    definition: 'The data provenance chamber. Records reproducibility scores for every job — can the same job be rerun and get the same result? Research-grade workloads benefit most. Biases routing toward high-reproducibility providers.',
    docPath:    '/docs/chambers#veritas',
    category:   'chambers',
  },
  Outerim: {
    term:       'Outerim Chamber',
    definition: 'The edge compute marketplace chamber. Tracks GPU supply and demand at the network edge (university campus clusters, regional operators). When acceptable for latency, it routes jobs to edge providers for lower cost.',
    docPath:    '/docs/chambers#outerim',
    category:   'chambers',
  },
  Mist: {
    term:       'Mist Chamber',
    definition: 'The price arbitrage strategy chamber. Identifies spread opportunities between GPU types and regions from ArbitrageSnapshot data. When active, adjusts pricing signals to capture value from market inefficiencies.',
    docPath:    '/docs/chambers#mist',
    category:   'chambers',
  },
  ChamberMode: {
    term:       'Chamber Mode',
    definition: 'Each chamber progresses through four modes: OFFLINE (not loaded), PASSIVE (listening and recording events but not influencing routing), BACKTEST (running historical event replay to measure improvement), ACTIVE (fully live, influencing routing decisions).',
    docPath:    '/docs/chambers#lifecycle',
    category:   'chambers',
  },
  Backtest: {
    term:       'Backtest',
    definition: 'A test where a chamber replays historical events to measure how much it would have improved outcomes if it had been active. Chambers must pass a backtest (score improvement > threshold) before they can be promoted to ACTIVE mode.',
    docPath:    '/docs/chambers#backtest',
    category:   'chambers',
  },

  // ── Platform ───────────────────────────────────────────────────────────────

  Provider: {
    term:       'Provider',
    definition: 'An organization or individual that connects GPU hardware to the GP4U network. Providers earn compute revenue on every job that runs on their hardware. They must install the provider agent and consent to hardware visibility.',
    docPath:    '/docs/provider-guide',
    category:   'platform',
  },
  ProviderTier: {
    term:       'Provider Tier',
    definition: 'UNIVERSITY providers stake their institution\'s reputation (no cash required) and receive student program revenue share. COMMERCIAL providers post a cash stake per GPU and can join immediately after verification.',
    docPath:    '/docs/provider-guide#tiers',
    category:   'platform',
  },
  RussianDoll: {
    term:       'Russian-Doll Telemetry',
    definition: 'The provider agent\'s telemetry system — named after nested monitoring layers. Every 10 seconds, it collects GPU utilization, VRAM usage, power draw, temperature, and network activity, then sends this to the platform for anomaly detection.',
    docPath:    '/docs/pipeline#telemetry',
    category:   'platform',
  },
  Tutela: {
    term:       'Tutela (Threat Detection)',
    definition: 'GP4U\'s anomaly detection subsystem. It analyzes telemetry streams for suspicious patterns — crypto mining signatures, VRAM overclaiming, unusual outbound network activity, process injection. When it detects a threat, it can instruct the provider agent to kill the job immediately.',
    category:   'platform',
  },
  VisibilityConsent: {
    term:       'Hardware Visibility',
    definition: 'A condition of joining GP4U as a provider: you grant the platform full visibility into GPU utilization, running processes, network connections, and hardware specs while jobs are running. This is the core trust mechanism. Providers cannot opt out.',
    docPath:    '/docs/provider-guide#visibility',
    category:   'platform',
  },

  // ── Energy ────────────────────────────────────────────────────────────────

  CarbonCredit: {
    term:       'Carbon Credit',
    definition: 'A tradeable certificate representing 1 tonne of CO₂ avoided or offset. GP4U providers whose hardware runs on ≥50% renewable energy can earn carbon credits verified by ZK energy attestation and registered with Gold Standard or Verra.',
    docPath:    '/docs/zk-attestation#energy',
    category:   'energy',
  },
  CarbonIntensity: {
    term:       'Carbon Intensity',
    definition: 'The grams of CO₂ emitted per kilowatt-hour of electricity consumed in a region. California\'s grid is much greener than Wyoming\'s. Aetherion tracks this in real time and routes jobs toward lower-carbon regions when possible.',
    category:   'energy',
  },
  kWh: {
    term:       'kWh (Kilowatt-Hour)',
    definition: 'A unit of energy. A single A100 GPU at full load draws ~400 watts. Running for 1 hour = 0.4 kWh. GP4U tracks exact energy consumption per job using NVML power readings and uses this for billing, carbon accounting, and credit issuance.',
    category:   'energy',
  },

}

/**
 * Search the glossary by partial term match.
 * Used by GlobalSearch to surface definitions.
 */
export function searchGlossary(query: string): Array<{ key: string; entry: GlossaryEntry }> {
  const q = query.toLowerCase()
  return Object.entries(GLOSSARY)
    .filter(([key, entry]) =>
      key.toLowerCase().includes(q) ||
      entry.term.toLowerCase().includes(q) ||
      entry.definition.toLowerCase().includes(q)
    )
    .slice(0, 8)
    .map(([key, entry]) => ({ key, entry }))
}
