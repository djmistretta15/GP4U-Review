/**
 * /api/admin/ledger — Obsidian Ledger Explorer
 *
 * GET → paginated ledger entries with optional filters
 *   ?page=1&limit=20&event_type=job.completed&subject_id=xxx
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page       = Math.max(1, parseInt(searchParams.get('page')  ?? '1'))
    const limit      = Math.min(100, parseInt(searchParams.get('limit') ?? '20'))
    const event_type = searchParams.get('event_type') ?? undefined
    const subject_id = searchParams.get('subject_id') ?? undefined

    const where = {
      ...(event_type ? { event_type } : {}),
      ...(subject_id ? { subject_id } : {}),
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: { block_index: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
        select: {
          id: true,
          entry_id: true,
          block_index: true,
          event_type: true,
          severity: true,
          subject_id: true,
          target_id: true,
          target_type: true,
          timestamp: true,
          block_hash: true,
          prev_hash: true,
          region: true,
          metadata: true,
        },
      }).catch(() => []),
      prisma.ledgerEntry.count({ where }).catch(() => 0),
    ])

    return NextResponse.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
