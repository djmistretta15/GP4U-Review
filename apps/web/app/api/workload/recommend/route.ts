/**
 * POST /api/workload/recommend — Workload Advisor Engine
 *
 * Given a description of a compute workload, returns a concrete GPU
 * recommendation: which GPU type, how many, VRAM required, estimated
 * duration, and estimated cost — with human-readable reasoning.
 *
 * This powers the floating Workload Advisor widget and the drag-and-drop
 * project analyzer. It is also callable by the customer CLI.
 *
 * The recommendation engine is rule-based at launch (deterministic, fast,
 * and auditable). The inputs are a superset of what the engine uses —
 * unrecognized fields are ignored so clients can be forward-compatible.
 *
 * OPEN_ROUTES: No — requires auth. Recommendations are personalized to
 * the caller's GPU availability and budget.
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, rateLimit, clientIp } from '@/lib/auth-guard'

// ─── Types ────────────────────────────────────────────────────────────────────

interface WorkloadInput {
  description?:       string
  framework?:         string   // pytorch, tensorflow, jax, huggingface, custom
  model_size_b?:      number   // model parameter count in billions
  dataset_size_gb?:   number
  precision?:         string   // fp32, fp16, bf16, int8, int4
  batch_size?:        number
  sequence_length?:   number
  workload_type?:     string   // TRAINING, INFERENCE, FINE_TUNING, RENDERING, etc.
  budget_usd?:        number
  preferred_region?:  string
  require_multi_gpu?: boolean
}

interface GpuRecommendation {
  gpu_type:                string
  gpu_count:               number
  vram_required_gb:        number
  estimated_duration_hours: number
  estimated_cost_usd:      number
  confidence:              'HIGH' | 'MEDIUM' | 'LOW'
  reasoning:               string
  available_now:           boolean
  gpu_id?:                 string
}

interface RecommendationResponse {
  recommendation:  GpuRecommendation
  alternatives:    GpuRecommendation[]
  workload_type:   string
  disclaimer:      string
}

// ─── VRAM Estimation Logic ─────────────────────────────────────────────────────

const PRECISION_BYTES: Record<string, number> = {
  fp32: 4, fp16: 2, bf16: 2, int8: 1, int4: 0.5,
}

/**
 * Estimate VRAM needed for a model.
 * Formula: params × bytes_per_param × overhead_multiplier
 * Overhead: 1× model weights + 1× optimizer states (AdamW) + 0.2× activations
 */
function estimateVram(model_size_b: number, precision: string, is_training: boolean): number {
  const bytes = PRECISION_BYTES[precision.toLowerCase()] ?? 2
  const model_gb = model_size_b * bytes      // 1B params × 2B (bf16) = 2GB
  const optimizer_gb = is_training ? model_gb * 2 : 0  // AdamW: 2× model size
  const activation_gb = model_gb * 0.3       // activations ~30% of model
  const total_gb = model_gb + optimizer_gb + activation_gb
  // Round up to nearest 4GB and add 2GB safety margin
  return Math.ceil(total_gb / 4) * 4 + 2
}

/**
 * Estimate training duration based on model size, dataset, and GPU tier.
 * Very rough heuristic — real timing depends on batch size, learning rate, etc.
 */
function estimateDuration(
  model_size_b: number,
  dataset_size_gb: number,
  gpu_flops_tflops: number,
  is_training: boolean,
): number {
  if (!is_training) {
    // Inference: much faster
    return Math.max(0.25, (model_size_b * dataset_size_gb) / (gpu_flops_tflops * 10))
  }
  // Training: model params × tokens × 6 FLOPs per token-param (forward + backward)
  const tokens = (dataset_size_gb * 1e9) / 4  // ~4 bytes per token average
  const total_flops = model_size_b * 1e9 * tokens * 6
  const gpu_flops_per_sec = gpu_flops_tflops * 1e12
  const seconds = total_flops / gpu_flops_per_sec
  return Math.max(0.5, seconds / 3600)  // in hours
}

// ─── GPU Capability Database ───────────────────────────────────────────────────

const GPU_PROFILES = [
  { name: 'RTX 4090',    vram_gb: 24,   tflops: 82.6,  tier: 'high',    workloads: ['INFERENCE', 'FINE_TUNING', 'TRAINING'] },
  { name: 'A100 40GB',   vram_gb: 40,   tflops: 77.6,  tier: 'pro',     workloads: ['TRAINING', 'FINE_TUNING', 'INFERENCE'] },
  { name: 'A100 80GB',   vram_gb: 80,   tflops: 77.6,  tier: 'pro',     workloads: ['TRAINING', 'FINE_TUNING', 'INFERENCE'] },
  { name: 'H100 80GB',   vram_gb: 80,   tflops: 204.9, tier: 'elite',   workloads: ['TRAINING', 'FINE_TUNING', 'INFERENCE'] },
  { name: 'RTX 3090',    vram_gb: 24,   tflops: 35.6,  tier: 'mid',     workloads: ['INFERENCE', 'FINE_TUNING'] },
  { name: 'RTX 4080',    vram_gb: 16,   tflops: 48.7,  tier: 'mid',     workloads: ['INFERENCE', 'RENDERING'] },
  { name: 'A40',         vram_gb: 48,   tflops: 37.4,  tier: 'pro',     workloads: ['TRAINING', 'RENDERING', 'SIMULATION'] },
  { name: 'V100 32GB',   vram_gb: 32,   tflops: 14.1,  tier: 'mid',     workloads: ['TRAINING', 'INFERENCE'] },
  { name: 'RTX 4060 Ti', vram_gb: 8,    tflops: 22.1,  tier: 'entry',   workloads: ['INFERENCE', 'DATA_PROCESSING'] },
] as const

/**
 * Select the best GPU profile for the workload requirements.
 * Returns primary recommendation + alternatives.
 */
function selectGpu(
  vram_needed_gb: number,
  workload_type: string,
  estimated_hours: number,
  budget_usd?: number,
  gpu_price_map: Map<string, number> = new Map(),
): GpuRecommendation[] {
  const candidates = GPU_PROFILES
    .filter(g => g.vram_gb >= vram_needed_gb)
    .filter(g => g.workloads.includes(workload_type as never))
    .sort((a, b) => {
      // Sort: prefer exact fit over overkill, then by TFLOPS
      const a_fit = a.vram_gb - vram_needed_gb
      const b_fit = b.vram_gb - vram_needed_gb
      if (Math.abs(a_fit - b_fit) > 8) return a_fit - b_fit
      return b.tflops - a.tflops
    })

  if (candidates.length === 0) {
    // Multi-GPU recommendation: split across A100 80GB
    const gpu_count = Math.ceil(vram_needed_gb / 80)
    const price_per_hr = 3.20 * gpu_count
    return [{
      gpu_type:                 'A100 80GB',
      gpu_count,
      vram_required_gb:         vram_needed_gb,
      estimated_duration_hours: estimated_hours,
      estimated_cost_usd:       Math.round(price_per_hr * estimated_hours * 100) / 100,
      confidence:               'MEDIUM',
      reasoning:                `Model requires ${vram_needed_gb}GB VRAM. Distributing across ${gpu_count}× A100 80GB (${gpu_count * 80}GB total).`,
      available_now:            false,
    }]
  }

  return candidates.slice(0, 3).map((gpu, i) => {
    const price_per_hr = gpu_price_map.get(gpu.name) ?? (
      gpu.tier === 'elite' ? 4.50 :
      gpu.tier === 'pro'   ? 3.20 :
      gpu.tier === 'high'  ? 1.80 :
      gpu.tier === 'mid'   ? 0.90 : 0.40
    )
    const cost = Math.round(price_per_hr * estimated_hours * 100) / 100
    const over_budget = budget_usd ? cost > budget_usd : false

    return {
      gpu_type:                 gpu.name,
      gpu_count:                1,
      vram_required_gb:         vram_needed_gb,
      estimated_duration_hours: Math.round(estimated_hours * 10) / 10,
      estimated_cost_usd:       cost,
      confidence:               i === 0 ? 'HIGH' : 'MEDIUM' as const,
      reasoning:                over_budget
        ? `${gpu.name} (${gpu.vram_gb}GB VRAM, ${gpu.tflops} TFLOPS) — exceeds $${budget_usd} budget`
        : `${gpu.name} (${gpu.vram_gb}GB VRAM, ${gpu.tflops} TFLOPS) — ${gpu.vram_gb - vram_needed_gb}GB VRAM headroom`,
      available_now:            false,
    }
  })
}

/**
 * Infer workload type from description text.
 */
function inferWorkloadType(description: string, explicit?: string): string {
  if (explicit) return explicit.toUpperCase()
  const d = description.toLowerCase()
  if (d.includes('fine-tun') || d.includes('finetun')) return 'FINE_TUNING'
  if (d.includes('train')) return 'TRAINING'
  if (d.includes('infer') || d.includes('serving') || d.includes('deploy')) return 'INFERENCE'
  if (d.includes('render')) return 'RENDERING'
  if (d.includes('simulat')) return 'SIMULATION'
  if (d.includes('batch') || d.includes('process')) return 'DATA_PROCESSING'
  return 'TRAINING'
}

// ─── Route Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const rl = rateLimit(clientIp(req), 60, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const input = (body ?? {}) as WorkloadInput

  // Defaults
  const model_size_b    = Math.min(1000, Math.max(0.001, Number(input.model_size_b  ?? 7)))
  const dataset_size_gb = Math.min(10000, Math.max(0.001, Number(input.dataset_size_gb ?? 10)))
  const precision       = String(input.precision ?? 'bf16').toLowerCase()
  const description     = String(input.description ?? '').slice(0, 1000)
  const workload_type   = inferWorkloadType(description, input.workload_type)
  const is_training     = ['TRAINING', 'FINE_TUNING'].includes(workload_type)
  const budget_usd      = input.budget_usd ? Number(input.budget_usd) : undefined

  // Estimate VRAM
  const vram_needed = estimateVram(model_size_b, precision, is_training)

  // Pick a representative GPU for duration estimation (A100 80GB at ~77 TFLOPS)
  const ref_tflops = 77.6
  const est_hours  = estimateDuration(model_size_b, dataset_size_gb, ref_tflops, is_training)

  // Fetch live GPU prices from DB (best available prices)
  const live_gpus = await prisma.GPU.findMany({
    where:   { status: 'AVAILABLE' },
    select:  { name: true, pricePerHour: true },
    orderBy: { pricePerHour: 'asc' },
    take:    100,
  }).catch(() => [])

  const price_map = new Map<string, number>()
  for (const g of live_gpus) {
    if (!price_map.has(g.name)) {
      price_map.set(g.name, Number(g.pricePerHour))
    }
  }

  // Check availability in DB
  const available_names = new Set(live_gpus.map(g => g.name))

  // Generate recommendations
  const all_recs = selectGpu(vram_needed, workload_type, est_hours, budget_usd, price_map)

  // Mark availability and find a specific GPU ID for the primary recommendation
  for (const rec of all_recs) {
    rec.available_now = available_names.has(rec.gpu_type)
    if (rec.available_now && !rec.gpu_id) {
      const match = live_gpus.find(g => g.name === rec.gpu_type)
      // Note: we don't return the full GPU object here — just the availability flag
      void match
    }
  }

  const [primary, ...alternatives] = all_recs

  const response: RecommendationResponse = {
    recommendation: primary,
    alternatives,
    workload_type,
    disclaimer:
      'Estimates are based on typical workload characteristics. ' +
      'Actual VRAM usage and duration depend on batch size, sequence length, ' +
      'and implementation details. We recommend adding 20% headroom to VRAM estimates.',
  }

  return NextResponse.json(response)
}
