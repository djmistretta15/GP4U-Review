/**
 * /api/clusters — GPU Cluster Management
 *
 * A cluster is a named group of GPUs reserved together for large workloads
 * (LLM training, multi-GPU inference, distributed jobs).
 *
 * GET  → list cluster configurations for the user + available multi-GPU pools
 * POST → create a cluster reservation (selects matching GPUs from the pool)
 *
 * A cluster reservation:
 *   - Picks N GPUs matching provider, region, and GPU type
 *   - Estimates total cost (N × pricePerHour × durationHours)
 *   - Creates N Job records linked together via a shared cluster_id tag
 *   - Emits job.created events for each GPU slot
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

async function getUser(req: NextRequest) {
  const subjectId = req.headers.get('x-subject-id')
  if (subjectId && subjectId !== 'demo-subject-id') {
    const user = await prisma.user.findFirst({ where: { id: subjectId } })
    if (user) return user
  }
  return prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })
}

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req)
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    // Find all jobs that were created as part of a cluster (have cluster_ prefix in allocation_id)
    const clusterJobs = await prisma.job.findMany({
      where: {
        userId: user.id,
        allocation_id: { startsWith: 'cluster_' },
      },
      include: { gpu: true },
      orderBy: { createdAt: 'desc' },
    })

    // Group by cluster_id (stored in allocation_id)
    const clusterMap = new Map<string, typeof clusterJobs>()
    for (const job of clusterJobs) {
      const cid = job.allocation_id ?? 'unknown'
      const group = clusterMap.get(cid) ?? []
      group.push(job)
      clusterMap.set(cid, group)
    }

    const clusters = [...clusterMap.entries()].map(([cluster_id, jobs]) => ({
      cluster_id,
      name:          jobs[0]?.name.replace(/ \[GPU \d+\/\d+\]$/, '') ?? cluster_id,
      gpu_count:     jobs.length,
      status:        jobs.every(j => j.status === 'COMPLETE') ? 'COMPLETE'
                   : jobs.some(j => j.status === 'RUNNING')   ? 'RUNNING'
                   : jobs.some(j => j.status === 'FAILED')    ? 'FAILED'
                   : 'PENDING',
      total_cost:    jobs.reduce((s, j) => s + Number(j.costEstimate), 0),
      gpu_type:      jobs[0]?.gpu.name ?? 'Unknown',
      provider:      jobs[0]?.gpu.provider ?? 'OTHER',
      region:        jobs[0]?.gpu.region ?? 'unknown',
      created_at:    jobs[0]?.createdAt,
      jobs:          jobs.map(j => ({ id: j.id, name: j.name, status: j.status, gpu: j.gpu.name })),
    }))

    // Available GPU pools (groups of same type in same region)
    const availableGpus = await prisma.gPU.findMany({
      where:   { status: 'AVAILABLE' },
      select:  { id: true, name: true, provider: true, region: true, vramGB: true, pricePerHour: true },
    })

    // Group available GPUs into multi-GPU pools
    const poolMap = new Map<string, typeof availableGpus>()
    for (const gpu of availableGpus) {
      const key = `${gpu.name}::${gpu.provider}::${gpu.region}`
      const pool = poolMap.get(key) ?? []
      pool.push(gpu)
      poolMap.set(key, pool)
    }

    const pools = [...poolMap.entries()]
      .filter(([, gpus]) => gpus.length >= 2)  // Only show pools with ≥2 GPUs
      .map(([key, gpus]) => {
        const [gpu_type, provider, region] = key.split('::')
        return {
          gpu_type,
          provider,
          region,
          available_count: gpus.length,
          price_per_gpu_hr: Number(gpus[0]?.pricePerHour ?? 0),
          vram_gb:         gpus[0]?.vramGB ?? 0,
          sample_ids:      gpus.slice(0, 8).map(g => g.id),
        }
      })
      .sort((a, b) => a.price_per_gpu_hr - b.price_per_gpu_hr)

    return NextResponse.json({ clusters, pools })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const user = await getUser(req)
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const {
      name,
      gpu_type,
      provider,
      region,
      gpu_count,
      duration_hours,
      workload_type,
    } = await req.json() as {
      name: string
      gpu_type: string
      provider: string
      region: string
      gpu_count: number
      duration_hours: number
      workload_type?: string
    }

    if (gpu_count < 2 || gpu_count > 64) {
      return NextResponse.json({ error: 'gpu_count must be 2–64' }, { status: 400 })
    }

    // Find matching available GPUs
    const matchingGpus = await prisma.gPU.findMany({
      where: {
        name:     { contains: gpu_type.split(' ')[0] },
        provider: provider as never,
        region,
        status:   'AVAILABLE',
      },
      take: gpu_count,
    })

    if (matchingGpus.length < gpu_count) {
      return NextResponse.json({
        error: `Not enough GPUs: requested ${gpu_count}, found ${matchingGpus.length} available`,
      }, { status: 400 })
    }

    const cluster_id = `cluster_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Create one Job per GPU slot
    const jobs = await Promise.all(
      matchingGpus.map((gpu, i) => prisma.job.create({
        data: {
          userId:                user.id,
          gpuId:                 gpu.id,
          name:                  `${name} [GPU ${i + 1}/${gpu_count}]`,
          status:                'PENDING',
          expectedDurationHours: duration_hours,
          costEstimate:          Number(gpu.pricePerHour) * duration_hours,
          workload_type:         workload_type ?? 'TRAINING',
          allocation_id:         cluster_id,
          supply_tier:           String(gpu.supply_tier),
        },
        include: { gpu: true },
      }))
    )

    // Emit events
    try {
      const { publishJobCreated } = await import('@gp4u/event-bus')
      await Promise.allSettled(jobs.map(job =>
        publishJobCreated({
          job_id:              job.id,
          user_id:             user.id,
          gpu_id:              job.gpuId,
          workload_type:       job.workload_type,
          expected_duration_h: Number(job.expectedDurationHours),
          cost_estimate_usd:   Number(job.costEstimate),
          region:              job.gpu.region,
          supply_tier:         job.supply_tier ?? 'EDGE',
        })
      ))
    } catch {
      // Fire and forget
    }

    const total_cost = jobs.reduce((s, j) => s + Number(j.costEstimate), 0)

    return NextResponse.json({
      cluster_id,
      job_count:  jobs.length,
      total_cost,
      jobs: jobs.map(j => ({ id: j.id, name: j.name, gpu: j.gpu.name })),
    }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
