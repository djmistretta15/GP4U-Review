/**
 * /api/memory — Memory Staking
 *
 * Security fixes:
 *   - requireAuth() replaces demo user fallback
 *   - Atomic DELETE: updateMany with userId filter in WHERE clause — eliminates
 *     the check-then-act race condition
 *   - Input validation: vram_gb, ram_gb, asking_price_per_gb_sec all bounded
 *   - Price: must be > 0, capped at a reasonable ceiling
 *   - vram_gb: must not exceed GPU's physical VRAM
 *   - Rate limit: 10 stakes per minute per user
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { requireAuth, rateLimit, assertFinite, assertString, ValidationError } from '@/lib/auth-guard'

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  try {
    const stakes = await prisma.memoryStake.findMany({
      where:   { userId: auth.user.id },
      include: { gpu: { select: { id: true, name: true, provider: true, region: true, vramGB: true } } },
      orderBy: { createdAt: 'desc' },
      take:    200,
    })

    const activeStakes    = stakes.filter(s => s.is_active)
    const totalVramStaked = activeStakes.reduce((s, m) => s + m.vram_gb, 0)
    const totalRamStaked  = activeStakes.reduce((s, m) => s + m.ram_gb, 0)
    const totalEarned     = activeStakes.reduce((s, m) => s + Number(m.total_earned_usd), 0)

    return NextResponse.json({
      stakes,
      summary: {
        active_count:     activeStakes.length,
        total_vram_gb:    totalVramStaked,
        total_ram_gb:     totalRamStaked,
        total_earned_usd: totalEarned,
      },
    })
  } catch (err) {
    console.error('[memory] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch stakes' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  if (!rateLimit(`memory:post:${auth.subject_id}`, 10, 60)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })
  }

  try {
    const body = await req.json() as Record<string, unknown>
    const { gpu_id, vram_gb, ram_gb, asking_price_per_gb_sec, idle_schedule } = body

    assertString(gpu_id, 'gpu_id', 36)
    assertFinite(vram_gb, 'vram_gb', 1, 10000)
    assertFinite(ram_gb, 'ram_gb', 1, 100000)
    // Price bounds: $0.000000001 to $1.00 per GB·s (prevents $0 and absurd prices)
    assertFinite(asking_price_per_gb_sec, 'asking_price_per_gb_sec', 1e-9, 1.0)

    if (idle_schedule !== undefined && idle_schedule !== null) {
      assertString(idle_schedule, 'idle_schedule', 128)
    }

    const gpu = await prisma.gPU.findUnique({ where: { id: String(gpu_id) } })
    if (!gpu) return NextResponse.json({ error: 'GPU not found' }, { status: 404 })

    if (Number(vram_gb) > gpu.vramGB) {
      return NextResponse.json(
        { error: `Cannot stake ${vram_gb}GB — GPU only has ${gpu.vramGB}GB VRAM` },
        { status: 400 }
      )
    }

    const stake = await prisma.memoryStake.create({
      data: {
        userId:                  auth.user.id,
        gpuId:                   String(gpu_id),
        vram_gb:                 Number(vram_gb),
        ram_gb:                  Number(ram_gb),
        asking_price_per_gb_sec: Number(asking_price_per_gb_sec),
        idle_schedule:           typeof idle_schedule === 'string' ? idle_schedule : null,
        is_active:               true,
      },
      include: { gpu: { select: { id: true, name: true, provider: true, region: true } } },
    })

    try {
      const { publishMemoryStaked } = await import('@gp4u/event-bus')
      await publishMemoryStaked({
        user_id:                 auth.user.id,
        gpu_id:                  String(gpu_id),
        vram_gb:                 Number(vram_gb),
        ram_gb:                  Number(ram_gb),
        asking_price_per_gb_sec: Number(asking_price_per_gb_sec),
        stake_id:                stake.id,
      })
    } catch { /* event bus may not be bootstrapped in dev */ }

    return NextResponse.json({ stake }, { status: 201 })
  } catch (err) {
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[memory] POST error:', err)
    return NextResponse.json({ error: 'Failed to create stake' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req)
  if (!auth.ok) return auth.response

  const id = req.nextUrl.searchParams.get('id')
  if (!id || !/^[a-zA-Z0-9_-]{1,36}$/.test(id)) {
    return NextResponse.json({ error: 'Valid id required' }, { status: 400 })
  }

  try {
    // Atomic: updateMany includes userId in WHERE — eliminates check-then-act race condition.
    // If count === 0, either the stake doesn't exist or belongs to another user.
    const { count } = await prisma.memoryStake.updateMany({
      where: { id, userId: auth.user.id, is_active: true },
      data:  { is_active: false },
    })

    if (count === 0) {
      return NextResponse.json({ error: 'Stake not found or already inactive' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[memory] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to deactivate stake' }, { status: 500 })
  }
}
