/**
 * /api/jobs — Job API Route
 *
 * Security fixes applied:
 *   - requireAuth() replaces demo user fallback — fails 401 if not authenticated
 *   - PATCH verifies the job belongs to the requesting user before updating
 *   - Input validation: name, gpuId, expectedDurationHours, costEstimate all validated
 *   - costEstimate is computed server-side from GPU price × duration, not accepted from client
 *   - Rate limiting: 30 job creates per minute per user
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishJobCreated, publishJobCompleted } from '@gp4u/event-bus'
import { requireAuth, rateLimit, clientIp, assertFinite, assertString, ValidationError } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const jobs = await prisma.job.findMany({
      where:   { userId: auth.user.id },
      include: { gpu: true },
      orderBy: { createdAt: 'desc' },
      take:    100,  // Bound the result set
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error('[jobs] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  // Rate limit: 30 new jobs per minute per user
  if (!rateLimit(`jobs:post:${auth.subject_id}`, 30, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded — slow down' }, { status: 429 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const { gpuId, name, expectedDurationHours, workload_type } = body

    // Validate all inputs — never trust the client
    assertString(name, 'name', 128)
    assertString(gpuId, 'gpuId', 36)
    assertFinite(expectedDurationHours, 'expectedDurationHours', 0.1, 720) // 6 min to 30 days

    const gpu = await prisma.gPU.findUnique({ where: { id: String(gpuId) } })
    if (!gpu) return NextResponse.json({ error: 'GPU not found' }, { status: 404 })
    if (gpu.status !== 'AVAILABLE') {
      return NextResponse.json({ error: 'GPU is not available' }, { status: 409 })
    }

    // Compute cost server-side — never accept costEstimate from the client
    const costEstimate = Number(gpu.pricePerHour) * Number(expectedDurationHours)

    const job = await prisma.job.create({
      data: {
        name:                  String(name).trim(),
        userId:                auth.user.id,
        gpuId:                 String(gpuId),
        expectedDurationHours: Number(expectedDurationHours),
        costEstimate,
        status:                'PENDING',
        workload_type:         typeof workload_type === 'string' ? workload_type : 'INFERENCE',
      },
      include: { gpu: true },
    })

    const correlation_id = req.headers.get('x-correlation-id') ?? undefined

    await publishJobCreated(
      {
        job_id:                   job.id,
        subject_id:               auth.user.id,
        gpu_id:                   gpu.id,
        workload_type:             job.workload_type ?? 'INFERENCE',
        vram_requested_gb:         gpu.vramGB,
        estimated_duration_hours:  Number(expectedDurationHours),
        estimated_cost_usd:        costEstimate,
        region:                    gpu.region,
        supply_tier:               (gpu as Record<string, unknown>)['supply_tier'] as string ?? 'EDGE',
      },
      correlation_id
    ).catch(err => console.error('[jobs] event publish error (non-fatal):', err))

    return NextResponse.json({ job }, { status: 201 })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[jobs] POST error:', err)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const body = await req.json() as Record<string, unknown>
    const { id, status, actualCostUsd, durationHours, energyKwh } = body

    assertString(id, 'id', 36)

    const VALID_STATUSES = new Set(['RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED'])
    if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
      return NextResponse.json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` }, { status: 400 })
    }

    // CRITICAL: verify job belongs to the requesting user before update
    const existing = await prisma.job.findFirst({
      where: { id: String(id), userId: auth.user.id },
    })
    if (!existing) {
      // Return 404 — not 403 — to avoid confirming the job exists for other users
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const job = await prisma.job.update({
      where: { id: String(id) },
      data:  { status },
      include: { gpu: true },
    })

    const correlation_id = req.headers.get('x-correlation-id') ?? undefined

    if (status === 'COMPLETE' && actualCostUsd !== undefined) {
      const cost = Number(actualCostUsd)
      if (isFinite(cost) && cost >= 0) {
        await publishJobCompleted(
          {
            job_id:              job.id,
            subject_id:          job.userId,
            gpu_id:              job.gpuId,
            allocation_id:       job.id,
            duration_hours:      typeof durationHours === 'number' ? durationHours : Number(job.expectedDurationHours),
            actual_cost_usd:     cost,
            energy_consumed_kwh: typeof energyKwh === 'number' ? energyKwh : 0,
          },
          correlation_id
        ).catch(err => console.error('[jobs] event publish error (non-fatal):', err))
      }
    }

    return NextResponse.json({ job })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[jobs] PATCH error:', err)
    return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
  }
}
