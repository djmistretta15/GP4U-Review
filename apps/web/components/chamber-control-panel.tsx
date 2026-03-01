'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Settings2, Loader2 } from 'lucide-react'

const CHAMBERS = ['mnemo', 'aetherion', 'energy', 'veritas', 'outerim', 'mist']

interface ActionResult {
  ok: boolean
  message?: string
  result?: {
    score?: number
    improvement_pct?: number
    passed?: boolean
    summary?: string
  }
}

export function ChamberControlPanel() {
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, ActionResult>>({})

  async function doAction(chamber_id: string, action: string) {
    const key = `${chamber_id}.${action}`
    setLoading(key)
    try {
      const res  = await fetch('/api/admin/chambers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, chamber_id }),
      })
      const data = await res.json() as ActionResult
      setResults(prev => ({ ...prev, [chamber_id]: data }))
    } catch (e) {
      setResults(prev => ({ ...prev, [chamber_id]: { ok: false, message: String(e) } }))
    } finally {
      setLoading(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings2 className="h-5 w-5" />
          Chamber Controls
        </CardTitle>
        <CardDescription>Manually activate, deactivate, or run backtests</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {CHAMBERS.map(id => {
          const res = results[id]
          return (
            <div key={id} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{id}</span>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={loading !== null}
                    onClick={() => doAction(id, 'activate')}
                  >
                    {loading === `${id}.activate` ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Activate'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={loading !== null}
                    onClick={() => doAction(id, 'deactivate')}
                  >
                    Pause
                  </Button>
                </div>
              </div>
              {res && (
                <div className="text-xs rounded bg-muted px-2 py-1">
                  {res.result ? (
                    <span className={res.result.passed ? 'text-green-700' : 'text-yellow-700'}>
                      Score: {res.result.score} · {res.result.improvement_pct?.toFixed(1)}% improvement
                      {' · '}{res.result.passed ? '✓ Activated' : '✗ Below threshold'}
                    </span>
                  ) : (
                    <span className={res.ok ? 'text-green-700' : 'text-red-700'}>
                      {res.message ?? (res.ok ? 'OK' : 'Error')}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        <div className="pt-2 border-t">
          <Badge variant="outline" className="text-xs text-muted-foreground">
            Threshold watcher auto-promotes when events ≥ min threshold
          </Badge>
        </div>
      </CardContent>
    </Card>
  )
}
