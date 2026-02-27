'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArbitrageTable } from '@/components/arbitrage-table'
import { calculateArbitrage, GPU_TYPES } from '@/lib/arbitrage'
import type { ArbitrageResult } from '@/lib/arbitrage'
import { Calculator, Info } from 'lucide-react'

export default function ArbitragePage() {
  const [gpuType, setGpuType] = useState<string>(GPU_TYPES[0])
  const [numGpus, setNumGpus] = useState<number>(1)
  const [durationHours, setDurationHours] = useState<number>(24)
  const [results, setResults] = useState<ArbitrageResult[]>([])

  const handleCalculate = () => {
    const arbitrageResults = calculateArbitrage(gpuType, numGpus, durationHours)
    setResults(arbitrageResults)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Cross-Cloud Arbitrage</h1>
        <p className="text-muted-foreground">
          Compare GPU prices across providers to find the best deal
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Calculator Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>
              Enter your requirements to compare prices
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="gpu-type">GPU Type</Label>
              <Select value={gpuType} onValueChange={setGpuType}>
                <SelectTrigger id="gpu-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GPU_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="num-gpus">Number of GPUs</Label>
              <Input
                id="num-gpus"
                type="number"
                min="1"
                max="100"
                value={numGpus}
                onChange={(e) => setNumGpus(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (hours)</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                max="8760"
                value={durationHours}
                onChange={(e) => setDurationHours(parseInt(e.target.value) || 1)}
              />
              <p className="text-xs text-muted-foreground">
                Common: 1h, 8h, 24h, 168h (week), 730h (month)
              </p>
            </div>

            <Button onClick={handleCalculate} className="w-full" size="lg">
              Calculate Prices
            </Button>
          </CardContent>
        </Card>

        {/* Info Cards */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-blue-50 border-blue-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Info className="h-5 w-5" />
                How It Works
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-900 space-y-2">
              <p>
                Our arbitrage engine compares real-time pricing across AWS, GCP, Azure,
                Lambda Labs, and RunPod to find you the best deal.
              </p>
              <p className="font-medium">
                Save up to 40% by choosing the optimal provider for your workload.
              </p>
            </CardContent>
          </Card>

          {results.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Configuration</div>
                    <div className="text-lg font-semibold">
                      {numGpus}x {gpuType}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                    <div className="text-lg font-semibold">{durationHours}h</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Best Price</div>
                    <div className="text-lg font-semibold text-green-600">
                      ${results[0]?.totalCost.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Best Provider</div>
                    <div className="text-lg font-semibold">{results[0]?.provider}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Results Table */}
      {results.length > 0 && <ArbitrageTable results={results} />}

      {results.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Configure your requirements above and click Calculate to see price comparisons
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
