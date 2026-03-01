'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ArbitrageTable } from '@/components/arbitrage-table'
import { GPU_TYPES } from '@/lib/arbitrage'
import { PageHeader } from '@/components/ui/page-header'
import { InfoTooltip, Term } from '@/components/ui/info-tooltip'
import { NoArbitrageResultsEmpty } from '@/components/ui/empty-state'
import { Calculator, Info, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

type ArbitrageResult = {
  provider: string
  pricePerHour: number
  totalCost: number
  available: boolean
  savingsVsBest?: number
}

type ArbitrageResponse = {
  gpuType: string
  numGpus: number
  durationHours: number
  results: ArbitrageResult[]
  best_provider: string
  potential_savings_usd: number
  data_source: 'live_db' | 'static_fallback'
}

export default function ArbitragePage() {
  const [gpuType, setGpuType]               = useState<string>(GPU_TYPES[0])
  const [numGpus, setNumGpus]               = useState<number>(1)
  const [durationHours, setDurationHours]   = useState<number>(24)
  const [response, setResponse]             = useState<ArbitrageResponse | null>(null)
  const [loading, setLoading]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const handleCalculate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/arbitrage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpuType, numGpus, durationHours }),
      })
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data: ArbitrageResponse = await res.json()
      setResponse(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Calculation failed')
    } finally {
      setLoading(false)
    }
  }

  const results = response?.results ?? []

  return (
    <div>
      <PageHeader
        title="Cross-Cloud Arbitrage"
        description="Live price comparison across providers. Every calculation trains the Mist and Aetherion chambers."
        helpTopic="arbitrage"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Arbitrage' }]}
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Calculator */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Configuration
            </CardTitle>
            <CardDescription>Configure your requirements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>GPU Type</Label>
              <Select value={gpuType} onValueChange={setGpuType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GPU_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Number of GPUs</Label>
              <Input type="number" min="1" max="100" value={numGpus}
                onChange={e => setNumGpus(parseInt(e.target.value) || 1)} />
            </div>
            <div className="space-y-2">
              <Label>Duration (hours)</Label>
              <Input type="number" min="1" max="8760" value={durationHours}
                onChange={e => setDurationHours(parseInt(e.target.value) || 1)} />
              <p className="text-xs text-muted-foreground">Common: 8h, 24h, 168h (week)</p>
            </div>
            <Button onClick={handleCalculate} className="w-full" size="lg" disabled={loading}>
              {loading ? 'Calculating…' : 'Calculate Prices'}
            </Button>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </CardContent>
        </Card>

        {/* Info + Summary */}
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
                Live prices from our ArbitrageSnapshot store — updated with every calculation.
                Each comparison trains the Mist and Aetherion chambers passively.
              </p>
              <p className="font-medium">Save up to 40% by choosing the optimal provider.</p>
            </CardContent>
          </Card>

          {response && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Configuration</div>
                    <div className="text-lg font-semibold">{numGpus}× {gpuType}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Duration</div>
                    <div className="text-lg font-semibold">{durationHours}h</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Best Price</div>
                    <div className="text-lg font-semibold text-green-700">
                      ${results[0]?.totalCost.toFixed(2)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Best Provider</div>
                    <div className="text-lg font-semibold">{response.best_provider}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-green-200">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Potential savings vs worst option: ${response.potential_savings_usd.toFixed(2)}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {response.data_source === 'live_db' ? 'Live data' : 'Seed data'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {results.length > 0 && <ArbitrageTable results={results} />}

      {!response && <NoArbitrageResultsEmpty />}
    </div>
  )
}
