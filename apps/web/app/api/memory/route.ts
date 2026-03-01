/**
 * /api/memory — Memory Staking (Mnemo Chamber)
 *
 * GET  → list all active memory stakes for the current user
 * POST → create a new memory stake
 * DELETE ?id=xxx → deactivate a stake
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// ─── helpers ────────────────────────────────────────────────────────────────

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

    const stakes = await prisma.memoryStake.findMany({
      where:   { userId: user.id },
      include: { gpu: { select: { id: true, name: true, provider: true, region: true, vramGB: true } } },
      orderBy: { createdAt: 'desc' },
    })

    // Aggregate summary
    const activeStakes   = stakes.filter(s => s.is_active)
    const totalVramStaked = activeStakes.reduce((s, m) => s + m.vram_gb, 0)
    const totalRamStaked  = activeStakes.reduce((s, m) => s + m.ram_gb, 0)
    const totalEarned     = activeStakes.reduce((s, m) => s + Number(m.total_earned_usd), 0)

    return NextResponse.json({
      stakes,
      summary: {
        active_count:      activeStakes.length,
        total_vram_gb:     totalVramStaked,
        total_ram_gb:      totalRamStaked,
        total_earned_usd:  totalEarned,
      },
    })
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
      gpu_id,
      vram_gb,
      ram_gb,
      asking_price_per_gb_sec,
      idle_schedule,
    } = await req.json() as {
      gpu_id: string
      vram_gb: number
      ram_gb: number
      asking_price_per_gb_sec: number
      idle_schedule?: string
    }

    // Validate GPU belongs to available pool
    const gpu = await prisma.gPU.findUnique({ where: { id: gpu_id } })
    if (!gpu) return NextResponse.json({ error: 'GPU not found' }, { status: 404 })

    // Guard: can't stake more VRAM than GPU has
    if (vram_gb > gpu.vramGB) {
      return NextResponse.json(
        { error: `Cannot stake ${vram_gb}GB — GPU only has ${gpu.vramGB}GB VRAM` },
        { status: 400 }
      )
    }

    const stake = await prisma.memoryStake.create({
      data: {
        userId:                  user.id,
        gpuId:                   gpu_id,
        vram_gb,
        ram_gb,
        asking_price_per_gb_sec,
        idle_schedule:           idle_schedule ?? null,
        is_active:               true,
      },
      include: { gpu: { select: { id: true, name: true, provider: true, region: true } } },
    })

    // Emit event to Mnemo chamber
    try {
      const { publishMemoryStaked } = await import('@gp4u/event-bus')
      await publishMemoryStaked({
        user_id:                 user.id,
        gpu_id,
        vram_gb,
        ram_gb,
        asking_price_per_gb_sec,
        stake_id:                stake.id,
      })
    } catch {
      // Platform may not be bootstrapped in dev — fire and forget
    }

    return NextResponse.json({ stake }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  try {
    const id   = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const user = await getUser(req)
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const stake = await prisma.memoryStake.findFirst({
      where: { id, userId: user.id },
    })
    if (!stake) return NextResponse.json({ error: 'Stake not found' }, { status: 404 })

    await prisma.memoryStake.update({
      where: { id },
      data:  { is_active: false },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
