'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Server, Loader2 } from 'lucide-react'

interface Pool {
  gpu_type: string
  provider: string
  region: string
  count: number
  price_per_gpu_hr: number
  vram_gb: number
}

interface ClusterBuilderProps {
  pools: Pool[]
}

export function ClusterBuilder({ pools }: ClusterBuilderProps) {
  const router = useRouter()
  const [selectedPool, setSelectedPool] = useState<Pool | null>(null)
  const [name, setName]                 = useState('')
  const [gpuCount, setGpuCount]         = useState(2)
  const [durationHrs, setDurationHrs]   = useState(8)
  const [workload, setWorkload]         = useState('TRAINING')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [success, setSuccess]           = useState<string | null>(null)

  const estimatedCost = selectedPool
    ? selectedPool.price_per_gpu_hr * gpuCount * durationHrs
    : 0

  const totalVram = selectedPool ? selectedPool.vram_gb * gpuCount : 0

  async function submit() {
    if (!selectedPool) { setError('Select a pool first'); return }
    if (!name.trim()) { setError('Enter a cluster name'); return }
    setLoading(true); setError(null); setSuccess(null)

    try {
      const res = await fetch('/api/clusters', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          name:          name.trim(),
          gpu_type:      selectedPool.gpu_type,
          provider:      selectedPool.provider,
          region:        selectedPool.region,
          gpu_count:     gpuCount,
          duration_hours: durationHrs,
          workload_type:  workload,
        }),
      })
      const data = await res.json() as { error?: string; cluster_id?: string; job_count?: number; total_cost?: number }
      if (!res.ok) { setError(data.error ?? 'Failed'); return }
      setSuccess(`Cluster reserved: ${data.job_count} GPUs, $${data.total_cost?.toFixed(2)} estimated cost`)
      setName('')
      router.refresh()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5 text-blue-600" />
          Reserve Cluster
        </CardTitle>
        <CardDescription>Multi-GPU reservation for large workloads</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pool selector */}
        <div>
          <label className="text-sm font-medium mb-1 block">GPU Pool</label>
          {pools.length === 0 ? (
            <p className="text-sm text-muted-foreground">No multi-GPU pools available right now.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {pools.map(pool => (
                <button
                  key={`${pool.gpu_type}${pool.provider}${pool.region}`}
                  type="button"
                  onClick={() => {
                    setSelectedPool(pool)
                    setGpuCount(Math.min(gpuCount, pool.count))
                  }}
                  className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                    selectedPool?.gpu_type === pool.gpu_type && selectedPool?.region === pool.region
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-transparent hover:border-gray-300 hover:bg-muted/50'
                  }`}
                >
                  <div className="font-medium">{pool.gpu_type}</div>
                  <div className="text-xs text-muted-foreground flex gap-2">
                    <Badge variant="outline" className="text-[10px] px-1 py-0">{pool.provider}</Badge>
                    <span>{pool.region}</span>
                    <span>{pool.count} avail.</span>
                    <span>${pool.price_per_gpu_hr.toFixed(2)}/hr</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cluster name */}
        <div>
          <label className="text-sm font-medium mb-1 block">Cluster Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. LLaMA-70B Training Run"
            className="w-full border rounded px-3 py-1.5 text-sm"
          />
        </div>

        {/* GPU count */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            GPU count: <span className="text-blue-600">{gpuCount}</span>
            {selectedPool && <span className="text-muted-foreground"> / {selectedPool.count} available</span>}
          </label>
          <input
            type="range"
            min={2}
            max={selectedPool?.count ?? 8}
            value={gpuCount}
            onChange={e => setGpuCount(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Duration */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            Duration: <span className="text-blue-600">{durationHrs}h</span>
          </label>
          <input
            type="range"
            min={1}
            max={168}
            value={durationHrs}
            onChange={e => setDurationHrs(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Workload type */}
        <div>
          <label className="text-sm font-medium mb-1 block">Workload</label>
          <select
            value={workload}
            onChange={e => setWorkload(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm"
          >
            <option value="TRAINING">Training</option>
            <option value="INFERENCE">Inference</option>
            <option value="FINE_TUNING">Fine-Tuning</option>
          </select>
        </div>

        {/* Cost estimate */}
        {selectedPool && (
          <div className="rounded bg-muted p-3 text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">GPUs</span>
              <span>{gpuCount}× {selectedPool.gpu_type}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total VRAM</span>
              <span>{totalVram} GB</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Estimated cost</span>
              <span className="text-green-700">${estimatedCost.toFixed(2)}</span>
            </div>
          </div>
        )}

        {error   && <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 rounded p-2">{success}</p>}

        <Button
          className="w-full"
          disabled={!selectedPool || !name.trim() || loading}
          onClick={submit}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Reserving…</>
            : 'Reserve Cluster'
          }
        </Button>
      </CardContent>
    </Card>
  )
}
