'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { HardDrive, Loader2 } from 'lucide-react'

interface GPU {
  id: string
  name: string
  provider: string
  region: string
  vramGB: number
  pricePerHour: number
}

interface StakeFormProps {
  gpus: GPU[]
}

export function StakeForm({ gpus }: StakeFormProps) {
  const router = useRouter()
  const [selectedGpu, setSelectedGpu] = useState<GPU | null>(null)
  const [vram_gb, setVramGb]                       = useState(8)
  const [ram_gb,  setRamGb]                        = useState(16)
  const [price,   setPrice]                        = useState('0.00000010')
  const [loading, setLoading]                      = useState(false)
  const [error,   setError]                        = useState<string | null>(null)

  async function submit() {
    if (!selectedGpu) { setError('Select a GPU first'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/memory', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          gpu_id:                  selectedGpu.id,
          vram_gb,
          ram_gb,
          asking_price_per_gb_sec: parseFloat(price),
        }),
      })
      if (!res.ok) {
        const d = await res.json() as { error?: string }
        setError(d.error ?? 'Failed to create stake')
        return
      }
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
          <HardDrive className="h-5 w-5 text-cyan-600" />
          Stake Memory
        </CardTitle>
        <CardDescription>
          Earn yield by renting out idle VRAM and RAM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GPU selector */}
        <div>
          <label className="text-sm font-medium mb-1 block">Select GPU</label>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {gpus.map(gpu => (
              <button
                key={gpu.id}
                type="button"
                onClick={() => {
                  setSelectedGpu(gpu)
                  setVramGb(Math.min(vram_gb, gpu.vramGB))
                }}
                className={`w-full text-left p-2 rounded border text-sm transition-colors ${
                  selectedGpu?.id === gpu.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-transparent hover:border-gray-300 hover:bg-muted/50'
                }`}
              >
                <div className="font-medium">{gpu.name}</div>
                <div className="text-xs text-muted-foreground flex gap-2">
                  <Badge variant="outline" className="text-[10px] px-1 py-0">{gpu.provider}</Badge>
                  <span>{gpu.region}</span>
                  <span>{gpu.vramGB}GB VRAM</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* VRAM amount */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            VRAM to stake: <span className="text-blue-600">{vram_gb} GB</span>
            {selectedGpu && <span className="text-muted-foreground"> / {selectedGpu.vramGB} GB</span>}
          </label>
          <input
            type="range"
            min={1}
            max={selectedGpu?.vramGB ?? 80}
            value={vram_gb}
            onChange={e => setVramGb(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* RAM amount */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            RAM to stake: <span className="text-indigo-600">{ram_gb} GB</span>
          </label>
          <input
            type="range"
            min={1}
            max={512}
            step={4}
            value={ram_gb}
            onChange={e => setRamGb(parseInt(e.target.value))}
            className="w-full"
          />
        </div>

        {/* Ask price */}
        <div>
          <label className="text-sm font-medium mb-1 block">Asking price (USD/GB·s)</label>
          <input
            type="number"
            step="0.00000001"
            min="0"
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="w-full border rounded px-3 py-1.5 text-sm font-mono"
          />
          <p className="text-xs text-muted-foreground mt-1">
            ≈ {(parseFloat(price) * 3600).toFixed(6)} USD/GB·hr
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded p-2">{error}</p>
        )}

        <Button
          className="w-full"
          disabled={!selectedGpu || loading}
          onClick={submit}
        >
          {loading
            ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Staking…</>
            : 'Stake Memory'
          }
        </Button>
      </CardContent>
    </Card>
  )
}
