import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClusterBuilder } from '@/components/cluster-builder'
import { PageHeader } from '@/components/ui/page-header'
import { StatusBadge } from '@/components/ui/status-badge'
import { InfoTooltip, Term } from '@/components/ui/info-tooltip'
import { NoClustersEmpty } from '@/components/ui/empty-state'
import { formatCurrency } from '@/lib/formatters'
import { Layers, Server, Zap } from 'lucide-react'

const STATUS_COLOURS: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-800',
  RUNNING:  'bg-blue-100 text-blue-800',
  COMPLETE: 'bg-green-100 text-green-800',
  FAILED:   'bg-red-100 text-red-800',
}

export default async function ClustersPage() {
  const user = await prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>User not found. Please run the seed script.</p>
      </div>
    )
  }

  // Cluster jobs (identified by cluster_ prefix in allocation_id)
  const clusterJobs = await prisma.job.findMany({
    where: { userId: user.id, allocation_id: { startsWith: 'cluster_' } },
    include: { gpu: { select: { name: true, provider: true, region: true, vramGB: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // Group into clusters
  const clusterMap = new Map<string, typeof clusterJobs>()
  for (const job of clusterJobs) {
    const cid = job.allocation_id ?? 'unknown'
    clusterMap.set(cid, [...(clusterMap.get(cid) ?? []), job])
  }

  const clusters = [...clusterMap.entries()].map(([cluster_id, jobs]) => ({
    cluster_id,
    name:        jobs[0]?.name.replace(/ \[GPU \d+\/\d+\]$/, '') ?? cluster_id,
    gpu_count:   jobs.length,
    status:      (jobs.every(j => j.status === 'COMPLETE') ? 'COMPLETE'
                : jobs.some(j => j.status === 'RUNNING')   ? 'RUNNING'
                : jobs.some(j => j.status === 'FAILED')    ? 'FAILED'
                : 'PENDING') as string,
    total_cost:  jobs.reduce((s, j) => s + Number(j.costEstimate), 0),
    total_vram:  jobs.reduce((s, j) => s + j.gpu.vramGB, 0),
    gpu_type:    jobs[0]?.gpu.name ?? '',
    provider:    String(jobs[0]?.gpu.provider ?? ''),
    region:      jobs[0]?.gpu.region ?? '',
    created_at:  jobs[0]?.createdAt,
    jobs,
  }))

  // Available multi-GPU pools
  const availableGpus = await prisma.gPU.findMany({
    where:  { status: 'AVAILABLE' },
    select: { id: true, name: true, provider: true, region: true, vramGB: true, pricePerHour: true },
  })

  const poolMap = new Map<string, typeof availableGpus>()
  for (const gpu of availableGpus) {
    const key = `${gpu.name}||${gpu.provider}||${gpu.region}`
    poolMap.set(key, [...(poolMap.get(key) ?? []), gpu])
  }

  const pools = [...poolMap.entries()]
    .filter(([, gpus]) => gpus.length >= 2)
    .map(([key, gpus]) => {
      const [gpu_type, provider, region] = key.split('||')
      return {
        gpu_type: gpu_type ?? '',
        provider: provider ?? '',
        region:   region ?? '',
        count:    gpus.length,
        price_per_gpu_hr: Number(gpus[0]?.pricePerHour ?? 0),
        vram_gb:  gpus[0]?.vramGB ?? 0,
      }
    })
    .sort((a, b) => a.price_per_gpu_hr - b.price_per_gpu_hr)

  const totalGpusInClusters = clusters.reduce((s, c) => s + c.gpu_count, 0)
  const totalTflops          = clusters.reduce((s, c) => s + c.total_vram, 0) // vram as proxy metric

  return (
    <div>
      <PageHeader
        title="GPU Clusters"
        description="Reserve multi-GPU clusters for large model training and distributed inference. Allocation is atomic — you get all GPUs or none."
        helpTopic="clusters"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Clusters' }]}
      />

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Active Clusters</span>
            </div>
            <div className="text-2xl font-bold">{clusters.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Server className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Total GPUs</span>
            </div>
            <div className="text-2xl font-bold">{totalGpusInClusters}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-muted-foreground flex items-center gap-1">Total <Term id="VRAM" className="text-sm font-normal" /></span>
            </div>
            <div className="text-2xl font-bold">{totalTflops} GB</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Cluster list */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Your Clusters</h2>

          {clusters.length === 0 ? (
            <NoClustersEmpty />
          ) : (
            clusters.map(cluster => (
              <Card key={cluster.cluster_id}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold">{cluster.name}</span>
                        <Badge variant="outline" className="text-xs">{cluster.gpu_count}× GPU</Badge>
                        <StatusBadge status={cluster.status} size="xs" />
                      </div>
                      <div className="grid grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="text-muted-foreground">GPU Type</div>
                          <div className="font-medium">{cluster.gpu_type}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Provider</div>
                          <div className="font-medium">{cluster.provider}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Region</div>
                          <div className="font-medium">{cluster.region}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total VRAM</div>
                          <div className="font-medium">{cluster.total_vram} GB</div>
                        </div>
                      </div>
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">Total cost: </span>
                        <span className="font-semibold">{formatCurrency(cluster.total_cost)}</span>
                        {cluster.created_at && (
                          <span className="text-muted-foreground ml-4">
                            Created {new Date(cluster.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}

          {/* Available pools */}
          {pools.length > 0 && (
            <>
              <h2 className="text-xl font-semibold pt-4">Available Pools</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {pools.map(pool => (
                  <Card key={`${pool.gpu_type}${pool.provider}${pool.region}`} className="border-dashed">
                    <CardContent className="pt-4">
                      <div className="font-medium">{pool.gpu_type}</div>
                      <div className="flex items-center gap-2 my-1">
                        <Badge variant="outline" className="text-xs">{pool.provider}</Badge>
                        <span className="text-xs text-muted-foreground">{pool.region}</span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {pool.count} available · {pool.vram_gb}GB VRAM each
                      </div>
                      <div className="text-sm font-semibold text-green-700 mt-1">
                        {formatCurrency(pool.price_per_gpu_hr)}/GPU/hr
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Cluster builder */}
        <div>
          <ClusterBuilder pools={pools} />
        </div>
      </div>
    </div>
  )
}
