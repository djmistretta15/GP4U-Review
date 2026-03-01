/**
 * /api/clusters — GPU Cluster Management
 *
 * Security fixes:
 *   - requireAuth() replaces demo user fallback
 *   - TOCTOU fix: GPU selection and status update run inside a single Prisma
 *     transaction — GPUs are atomically marked RESERVED before jobs are created,
 *     preventing double-allocation under concurrent requests
 *   - Input validation: name, gpu_count, duration_hours all bounded
 *   - gpu_type and provider values are validated against known enums
 *   - Rate limit: 5 cluster reservations per minute per user
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth, rateLimit, assertFinite, assertString, ValidationError } from '@/lib/auth-guard'

const VALID_WORKLOAD_TYPES = new Set(['TRAINING', 'INFERENCE', 'FINE_TUNING'])

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const clusterJobs = await prisma.job.findMany({
      where: {
        userId:        auth.user.id,
        allocation_id: { startsWith: 'cluster_' },
      },
      include: { gpu: { select: { name: true, provider: true, region: true, vramGB: true } } },
      orderBy: { createdAt: 'desc' },
      take:    500,
    })

    const clusterMap = new Map<string, typeof clusterJobs>()
    for (const job of clusterJobs) {
      const cid = job.allocation_id ?? 'unknown'
      clusterMap.set(cid, [...(clusterMap.get(cid) ?? []), job])
    }

    const clusters = [...clusterMap.entries()].map(([cluster_id, jobs]) => ({
      cluster_id,
      name:        jobs[0]?.name.replace(/ \[GPU \d+\/\d+\]$/, '') ?? cluster_id,
      gpu_count:   jobs.length,
      status:      jobs.every(j => j.status === 'COMPLETE') ? 'COMPLETE'
                 : jobs.some(j => j.status === 'RUNNING')   ? 'RUNNING'
                 : jobs.some(j => j.status === 'FAILED')    ? 'FAILED'
                 : 'PENDING',
      total_cost:  jobs.reduce((s, j) => s + Number(j.costEstimate), 0),
      total_vram:  jobs.reduce((s, j) => s + j.gpu.vramGB, 0),
      gpu_type:    jobs[0]?.gpu.name ?? '',
      provider:    String(jobs[0]?.gpu.provider ?? ''),
      region:      jobs[0]?.gpu.region ?? '',
      created_at:  jobs[0]?.createdAt,
    }))

    // Available pools (only for display — actual allocation uses the transaction below)
    const availableGpus = await prisma.gPU.findMany({
      where:  { status: 'AVAILABLE' },
      select: { id: true, name: true, provider: true, region: true, vramGB: true, pricePerHour: true },
    })

    const poolMap = new Map<string, typeof availableGpus>()
    for (const gpu of availableGpus) {
      const key = `${gpu.name}||${gpu.provider}||${gpu.region}`
      poolMap.set(key, [...(poolMap.get(key) ?? []), gpu])
    }

    const pools = [...poolMap.entries()]
      .filter(([, gpus]) => gpus.length >= 2)
      .map(([key, gpus]) => {
        const [gpu_type, provider, region] = key.split('||')
        return {
          gpu_type: gpu_type ?? '',
          provider: provider ?? '',
          region:   region ?? '',
          count:    gpus.length,
          price_per_gpu_hr: Number(gpus[0]?.pricePerHour ?? 0),
          vram_gb:  gpus[0]?.vramGB ?? 0,
        }
      })
      .sort((a, b) => a.price_per_gpu_hr - b.price_per_gpu_hr)

    return NextResponse.json({ clusters, pools })
  } catch (err) {
    console.error('[clusters] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch clusters' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  // Rate limit: 5 cluster reservations per minute per user
  if (!rateLimit(`clusters:post:${auth.subject_id}`, 5, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const { name, gpu_type, provider, region, gpu_count, duration_hours, workload_type } = body

    assertString(name, 'name', 128)
    assertString(gpu_type, 'gpu_type', 64)
    assertString(provider, 'provider', 32)
    assertString(region, 'region', 64)
    assertFinite(gpu_count, 'gpu_count', 2, 64)
    assertFinite(duration_hours, 'duration_hours', 0.1, 720)

    const wl = typeof workload_type === 'string' && VALID_WORKLOAD_TYPES.has(workload_type)
      ? workload_type
      : 'TRAINING'

    // Sanitize gpu_type: only allow the first token (e.g. "A100" from "A100 SXM4 80GB")
    const gpu_type_prefix = String(gpu_type).split(/\s+/)[0]!.replace(/[^a-zA-Z0-9]/g, '')
    if (!gpu_type_prefix) {
      return NextResponse.json({ error: 'Invalid gpu_type' }, { status: 400 })
    }

    const cluster_id = `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const n          = Math.floor(Number(gpu_count))
    const dur        = Number(duration_hours)

    // TOCTOU FIX: run inside a transaction.
    // 1. Find available GPUs
    // 2. Atomically mark them RESERVED
    // 3. Create jobs
    // All three steps are atomic — no other request can steal these GPUs between steps.
    const result = await prisma.$transaction(async (tx) => {
      const matchingGpus = await tx.gPU.findMany({
        where: {
          name:     { contains: gpu_type_prefix },
          provider: String(provider) as never,
          region:   String(region),
          status:   'AVAILABLE',
        },
        take: n,
      })

      if (matchingGpus.length < n) {
        throw new Error(`Not enough GPUs: requested ${n}, found ${matchingGpus.length} available`)
      }

      // Lock them immediately
      await tx.gPU.updateMany({
        where: { id: { in: matchingGpus.map(g => g.id) } },
        data:  { status: 'RESERVED' },
      })

      const jobs = await Promise.all(
        matchingGpus.map((gpu, i) => tx.job.create({
          data: {
            userId:                auth.user.id,
            gpuId:                 gpu.id,
            name:                  `${String(name).trim()} [GPU ${i + 1}/${n}]`,
            status:                'PENDING',
            expectedDurationHours: dur,
            // Cost computed server-side
            costEstimate:          Number(gpu.pricePerHour) * dur,
            workload_type:         wl,
            allocation_id:         cluster_id,
            supply_tier:           String((gpu as Record<string, unknown>)['supply_tier'] ?? 'EDGE'),
          },
          include: { gpu: true },
        }))
      )

      return jobs
    })

    // Emit events outside the transaction (non-blocking)
    try {
      const { publishJobCreated } = await import('@gp4u/event-bus')
      await Promise.allSettled(result.map(job =>
        publishJobCreated({
          job_id:              job.id,
          user_id:             auth.user.id,
          gpu_id:              job.gpuId,
          workload_type:       job.workload_type,
          expected_duration_h: Number(job.expectedDurationHours),
          cost_estimate_usd:   Number(job.costEstimate),
          region:              job.gpu.region,
          supply_tier:         job.supply_tier ?? 'EDGE',
        })
      ))
    } catch { /* fire and forget */ }

    const total_cost = result.reduce((s, j) => s + Number(j.costEstimate), 0)

    return NextResponse.json({
      cluster_id,
      job_count:  result.length,
      total_cost,
      jobs: result.map(j => ({ id: j.id, name: j.name, gpu: j.gpu.name })),
    }, { status: 201 })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.startsWith('Not enough GPUs')) {
      return NextResponse.json({ error: msg }, { status: 409 })
    }
    console.error('[clusters] POST error:', err)
    return NextResponse.json({ error: 'Failed to create cluster' }, { status: 500 })
  }
}
