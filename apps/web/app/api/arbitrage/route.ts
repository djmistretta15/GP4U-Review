/**
 * /api/arbitrage — Arbitrage API Route
 *
 * Replaces the static GPU_PRICING table with live ArbitrageSnapshot
 * records from the DB. Every calculation emits an arbitrage.calculated
 * event which simultaneously fills:
 *   - Obsidian (immutable record of every price comparison)
 *   - Mist chamber (energy arbitrage signals)
 *   - Aetherion chamber (provider latency correlation)
 *
 * The static calculateArbitrage() in lib/arbitrage.ts remains as a
 * fallback when the DB has no snapshot data yet (cold start).
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { publishArbitrageCalculated } from '@gp4u/event-bus'
import { calculateArbitrage } from '@/lib/arbitrage'

export async function POST(request: Request) {
  try {
    const correlation_id = request.headers.get('x-correlation-id') ?? undefined
    const subject_id = request.headers.get('x-subject-id') ?? 'anonymous'

    const body = await request.json()
    const { gpuType, numGpus, durationHours } = body

    if (!gpuType || !numGpus || !durationHours) {
      return NextResponse.json(
        { error: 'gpuType, numGpus, and durationHours are required' },
        { status: 400 }
      )
    }

    // ── 1. Query live ArbitrageSnapshot records ──────────────────────────────
    // Uses the most recent snapshot per provider for this GPU type.
    // Falls back to static table if no live data yet.
    const snapshots = await prisma.arbitrageSnapshot.findMany({
      where: { gpuType },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    let results: Array<{
      provider: string
      pricePerHour: number
      totalCost: number
      available: boolean
      savingsVsBest?: number
    }>

    if (snapshots.length > 0) {
      // Deduplicate: latest snapshot per provider
      const latestByProvider = new Map<string, typeof snapshots[0]>()
      for (const s of snapshots) {
        if (!latestByProvider.has(s.provider)) {
          latestByProvider.set(s.provider, s)
        }
      }

      const raw = [...latestByProvider.values()].map(s => ({
        provider: s.provider,
        pricePerHour: Number(s.pricePerHour),
        totalCost: Number(s.pricePerHour) * numGpus * durationHours,
        available: true,
      }))

      raw.sort((a, b) => a.totalCost - b.totalCost)

      const bestCost = raw[0]?.totalCost ?? 0
      results = raw.map((r, i) => ({
        ...r,
        savingsVsBest: i > 0 ? r.totalCost - bestCost : undefined,
      }))
    } else {
      // Cold start — use static table
      results = calculateArbitrage(gpuType, numGpus, durationHours)
    }

    // ── 2. Persist new snapshot so the DB stays current ─────────────────────
    // In production this is replaced by a real-time price feed ingestion job.
    // For now each user calculation refreshes the snapshot store.
    for (const r of results) {
      await prisma.arbitrageSnapshot.create({
        data: {
          gpuType,
          numGpus,
          durationHours,
          provider: r.provider as never,
          pricePerHour: r.pricePerHour,
          totalCost: r.totalCost,
        },
      })
    }

    // ── 3. Compute real potential savings ────────────────────────────────────
    const bestCost = results[0]?.totalCost ?? 0
    const worstCost = results.at(-1)?.totalCost ?? 0
    const potential_savings_usd = worstCost - bestCost

    // ── 4. Emit arbitrage.calculated — fills 3 chambers simultaneously ───────
    await publishArbitrageCalculated(
      {
        subject_id,
        gpu_type:             gpuType,
        num_gpus:             numGpus,
        duration_hours:       durationHours,
        results:              results.map(r => ({
          provider:       r.provider,
          price_per_hour: r.pricePerHour,
          total_cost:     r.totalCost,
          available:      r.available,
        })),
        best_provider:        results[0]?.provider ?? '',
        potential_savings_usd,
      },
      correlation_id
    )

    return NextResponse.json({
      gpuType,
      numGpus,
      durationHours,
      results,
      best_provider:        results[0]?.provider,
      potential_savings_usd,
      data_source:          snapshots.length > 0 ? 'live_db' : 'static_fallback',
    })
  } catch (error) {
    console.error('Arbitrage calculation failed:', error)
    return NextResponse.json({ error: 'Arbitrage calculation failed' }, { status: 500 })
  }
}
