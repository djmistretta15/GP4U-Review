import Link from 'next/link'
import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DashboardStats } from '@/components/dashboard-stats'
import { JobCard } from '@/components/job-card'
import { formatCurrency, formatRelativeTime } from '@/lib/formatters'
import { TrendingDown, Zap, ExternalLink, Activity } from 'lucide-react'

export default async function DashboardPage() {
  const user = await prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>User not found. Please run the seed script.</p>
      </div>
    )
  }

  const jobs = await prisma.job.findMany({
    where: { userId: user.id },
    include: { gpu: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  })

  const totalSpend      = jobs.reduce((s, j) => s + Number(j.costEstimate), 0)
  const jobCount        = jobs.length
  const avgJobDuration  = jobCount > 0
    ? jobs.reduce((s, j) => s + Number(j.expectedDurationHours), 0) / jobCount
    : 0

  // ── Real savings from ArbitrageSnapshot ───────────────────────────────────
  // For each job, find if a cheaper provider existed at the time.
  let realSavings = 0
  for (const job of jobs) {
    const gpuName = job.gpu.name
      .replace('NVIDIA ', '')
      .replace(' ', '-')  // e.g. "A100 80GB" → "A100-80GB"
      .toUpperCase()

    const snapshots = await prisma.arbitrageSnapshot.findMany({
      where: { gpuType: { contains: gpuName.split('-')[0] } },
      orderBy: { pricePerHour: 'asc' },
      take: 1,
    })

    if (snapshots.length && snapshots[0].provider !== job.gpu.provider) {
      const cheaperCost = Number(snapshots[0].pricePerHour) * Number(job.expectedDurationHours)
      const diff        = Number(job.costEstimate) - cheaperCost
      if (diff > 0) realSavings += diff
    }
  }

  // ── Live best deal from DB ─────────────────────────────────────────────────
  const bestSnapshot = await prisma.arbitrageSnapshot.findFirst({
    orderBy: { pricePerHour: 'asc' },
  })

  // ── Chamber status ─────────────────────────────────────────────────────────
  const chamberStates = await prisma.chamberState.findMany({
    orderBy: { chamber_id: 'asc' },
  }).catch(() => [])  // Graceful if migration hasn't run yet

  const activeChambers = chamberStates.filter(c => c.mode === 'ACTIVE').length
  const totalChambers  = chamberStates.length || 6

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {user.name || user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            <Activity className="h-3 w-3 mr-1" />
            {activeChambers}/{totalChambers} chambers active
          </Badge>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin">Platform Status</Link>
          </Button>
        </div>
      </div>

      <div className="mb-8">
        <DashboardStats
          totalSpend={totalSpend}
          jobCount={jobCount}
          avgJobDuration={avgJobDuration}
          potentialSavings={realSavings}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Best Deal — live from DB */}
        <Card className="lg:col-span-2 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-900">
              <TrendingDown className="h-5 w-5" />
              Best Deal Right Now
            </CardTitle>
            <CardDescription className="text-green-700">
              From live ArbitrageSnapshot data
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bestSnapshot ? (
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-bold text-green-900">{bestSnapshot.gpuType}</h3>
                      <Badge className="bg-green-600">{bestSnapshot.provider}</Badge>
                    </div>
                    <div className="text-3xl font-bold text-green-600">
                      {formatCurrency(Number(bestSnapshot.pricePerHour))}/hr
                    </div>
                    <p className="text-sm text-green-700">Lowest price in our live snapshot store</p>
                  </div>
                  <Zap className="h-12 w-12 text-green-600" />
                </div>
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-green-200">
                  {[8, 24, 168].map(h => (
                    <div key={h}>
                      <div className="text-xs text-green-700">{h >= 168 ? '7 days' : `${h} hours`}</div>
                      <div className="font-bold text-green-900">
                        {formatCurrency(Number(bestSnapshot.pricePerHour) * h)}
                      </div>
                    </div>
                  ))}
                </div>
                <Button asChild className="w-full bg-green-600 hover:bg-green-700">
                  <Link href="/marketplace">
                    View in Marketplace <ExternalLink className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-green-700">No snapshots yet — run an arbitrage calculation first.</p>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common tasks</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/jobs">Create New Job</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/marketplace">Browse GPUs</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/arbitrage">Compare Prices</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/memory">Stake Memory</Link>
            </Button>
            <Button asChild variant="outline" className="w-full justify-start">
              <Link href="/clusters">GPU Clusters</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Jobs */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-semibold">Recent Jobs</h2>
          <Button asChild variant="outline"><Link href="/jobs">View All</Link></Button>
        </div>
        {jobs.slice(0, 3).length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {jobs.slice(0, 3).map(job => <JobCard key={job.id} job={job} />)}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">No jobs yet. Create your first job!</p>
              <Button asChild><Link href="/jobs">Create Job</Link></Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Usage Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Usage Summary</CardTitle>
          <CardDescription>Your GP4U activity overview</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-4 border-b">
              <div>
                <div className="font-medium">Account Status</div>
                <div className="text-sm text-muted-foreground">
                  Active since {formatRelativeTime(user.createdAt)}
                </div>
              </div>
              <Badge className="bg-green-100 text-green-800">Active</Badge>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Total Jobs</div>
                <div className="text-2xl font-bold">{jobCount}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Compute Time</div>
                <div className="text-2xl font-bold">
                  {jobs.reduce((s, j) => s + Number(j.expectedDurationHours), 0).toFixed(1)}h
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Avg Cost/Job</div>
                <div className="text-2xl font-bold">
                  {formatCurrency(jobCount > 0 ? totalSpend / jobCount : 0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-1">Real Savings Found</div>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(realSavings)}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
