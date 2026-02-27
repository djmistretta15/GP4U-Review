import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET available GPUs for job creation
export async function GET() {
  try {
    const gpus = await prisma.gpu.findMany({
      where: {
        status: {
          in: ['AVAILABLE', 'LIMITED'],
        },
      },
      select: {
        id: true,
        name: true,
        provider: true,
        pricePerHour: true,
      },
      orderBy: {
        pricePerHour: 'asc',
      },
    })

    return NextResponse.json(gpus)
  } catch (error) {
    console.error('Failed to fetch GPUs:', error)
    return NextResponse.json({ error: 'Failed to fetch GPUs' }, { status: 500 })
  }
}
