/**
 * /api/jobs — Job API Route
 *
 * Wired to the GP4U event bus. Every job creation emits a job.created event
 * which is immediately:
 *   - Logged to Obsidian (immutable ledger)
 *   - Received by Mnemo (VRAM demand telemetry)
 *   - Received by any other docked PASSIVE chamber
 *
 * The x-correlation-id header (injected by Custodes middleware) is threaded
 * through so the full request can be traced across every module.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishJobCreated, publishJobCompleted } from '@gp4u/event-bus'

// GET — list all jobs for the current user
export async function GET(request: Request) {
  try {
    const correlation_id = request.headers.get('x-correlation-id') ?? undefined
    const subject_id = request.headers.get('x-subject-id') ?? undefined

    // Fall back to demo user when auth middleware is in stub mode
    const user = subject_id
      ? await prisma.user.findUnique({ where: { id: subject_id } })
      : await prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const jobs = await prisma.job.findMany({
      where: { userId: user.id },
      include: { gpu: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

// POST — create a new job and emit job.created event
export async function POST(request: Request) {
  try {
    const correlation_id = request.headers.get('x-correlation-id') ?? undefined
    const subject_id = request.headers.get('x-subject-id') ?? undefined

    const body = await request.json()
    const { name, gpuId, expectedDurationHours, costEstimate, scriptPath } = body

    const user = subject_id
      ? await prisma.user.findUnique({ where: { id: subject_id } })
      : await prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const gpu = await prisma.gpu.findUnique({
      where: { id: gpuId },
      include: { health: true },
    })

    if (!gpu) {
      return NextResponse.json({ error: 'GPU not found' }, { status: 404 })
    }

    const job = await prisma.job.create({
      data: {
        name,
        userId: user.id,
        gpuId,
        expectedDurationHours,
        costEstimate,
        scriptPath: scriptPath || null,
        status: 'PENDING',
      },
      include: { gpu: true },
    })

    // ── Emit job.created to the platform event bus ───────────────────────────
    // This single publish reaches: Obsidian (ledger), Mnemo (VRAM demand),
    // and any other docked chamber subscribed to job.created.
    await publishJobCreated(
      {
        job_id:                   job.id,
        subject_id:               user.id,
        gpu_id:                   gpu.id,
        workload_type:            'TRAINING',   // TODO: add workload_type to job form
        vram_requested_gb:        gpu.vramGB,
        estimated_duration_hours: Number(expectedDurationHours),
        estimated_cost_usd:       Number(costEstimate),
        region:                   gpu.region,
        supply_tier:              (gpu as Record<string, unknown>)['supply_tier'] as string ?? 'EDGE',
      },
      correlation_id
    )

    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    console.error('Failed to create job:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}

// PATCH — update job status and emit job.completed / job.failed
export async function PATCH(request: Request) {
  try {
    const correlation_id = request.headers.get('x-correlation-id') ?? undefined
    const body = await request.json()
    const { jobId, status, actualCostUsd, durationHours, energyKwh } = body

    const job = await prisma.job.update({
      where: { id: jobId },
      data: { status },
      include: { gpu: true },
    })

    if (status === 'COMPLETE' && actualCostUsd !== undefined) {
      await publishJobCompleted(
        {
          job_id:           job.id,
          subject_id:       job.userId,
          gpu_id:           job.gpuId,
          allocation_id:    jobId,
          duration_hours:   durationHours ?? Number(job.expectedDurationHours),
          actual_cost_usd:  actualCostUsd,
          energy_consumed_kwh: energyKwh,
        },
        correlation_id
      )
    }

    return NextResponse.json(job)
  } catch (error) {
    console.error('Failed to update job:', error)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}
