import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET all jobs
export async function GET() {
  try {
    const jobs = await prisma.job.findMany({
      include: {
        gpu: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json(jobs)
  } catch (error) {
    console.error('Failed to fetch jobs:', error)
    return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
  }
}

// POST create new job
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, gpuId, expectedDurationHours, costEstimate, scriptPath } = body

    // Get demo user (in production, this would come from auth)
    const user = await prisma.user.findFirst({
      where: { email: 'demo@gp4u.com' },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
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
      include: {
        gpu: true,
      },
    })

    return NextResponse.json(job, { status: 201 })
  } catch (error) {
    console.error('Failed to create job:', error)
    return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
  }
}
