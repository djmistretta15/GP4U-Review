'use client'

import { useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Database, ChevronLeft, ChevronRight } from 'lucide-react'

interface LedgerEntry {
  entry_id: string
  block_index: number
  event_type: string
  severity: string
  subject_id?: string
  timestamp: string
  block_hash: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  pages: number
}

interface LedgerExplorerProps {
  initialCount: number
}

const EVENT_COLOURS: Record<string, string> = {
  'job.completed':        'text-green-700',
  'job.created':          'text-blue-700',
  'job.failed':           'text-red-700',
  'auth.authenticated':   'text-purple-700',
  'arbitrage.calculated': 'text-amber-700',
  'memory.staked':        'text-cyan-700',
  'anomaly.detected':     'text-red-600',
}

export function LedgerExplorer({ initialCount }: LedgerExplorerProps) {
  const [entries, setEntries]         = useState<LedgerEntry[]>([])
  const [pagination, setPagination]   = useState<Pagination | null>(null)
  const [loading, setLoading]         = useState(false)
  const [page, setPage]               = useState(1)
  const [eventFilter, setEventFilter] = useState('')
  const [loaded, setLoaded]           = useState(false)

  const load = useCallback(async (p: number, filter: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' })
      if (filter) params.set('event_type', filter)
      const res  = await fetch(`/api/admin/ledger?${params}`)
      const data = await res.json() as { entries: LedgerEntry[]; pagination: Pagination }
      setEntries(data.entries)
      setPagination(data.pagination)
      setLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  if (!loaded) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            Full Ledger Browser
          </CardTitle>
          <CardDescription>{initialCount.toLocaleString()} total entries — paginated, filterable</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => load(1, '')} disabled={loading}>
            {loading ? 'Loading…' : 'Load Ledger'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              Full Ledger Browser
            </CardTitle>
            <CardDescription>
              {pagination?.total.toLocaleString()} entries · page {pagination?.page} of {pagination?.pages}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="text-sm border rounded px-2 py-1"
              value={eventFilter}
              onChange={e => {
                const v = e.target.value
                setEventFilter(v)
                setPage(1)
                load(1, v)
              }}
            >
              <option value="">All events</option>
              <option value="job.created">job.created</option>
              <option value="job.completed">job.completed</option>
              <option value="job.failed">job.failed</option>
              <option value="auth.authenticated">auth.authenticated</option>
              <option value="arbitrage.calculated">arbitrage.calculated</option>
              <option value="memory.staked">memory.staked</option>
              <option value="anomaly.detected">anomaly.detected</option>
            </select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5 mb-4">
          {entries.length === 0 && (
            <p className="text-muted-foreground text-sm">No entries match this filter.</p>
          )}
          {entries.map(entry => (
            <div
              key={entry.entry_id}
              className="flex items-center justify-between p-2 rounded border text-xs font-mono hover:bg-muted/50"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-muted-foreground w-10 text-right flex-shrink-0">#{entry.block_index}</span>
                <span className={EVENT_COLOURS[entry.event_type] ?? 'text-slate-700'}>
                  {entry.event_type}
                </span>
                {entry.subject_id && (
                  <span className="text-muted-foreground truncate">{entry.subject_id.slice(0, 12)}…</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1 py-0 ${entry.severity === 'CRITICAL' ? 'border-red-400 text-red-700' : entry.severity === 'WARN' ? 'border-yellow-400 text-yellow-700' : 'border-gray-200'}`}
                >
                  {entry.severity}
                </Badge>
                <span className="text-muted-foreground w-20 text-right">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => { const p = page - 1; setPage(p); load(p, eventFilter) }}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {pagination.pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.pages || loading}
              onClick={() => { const p = page + 1; setPage(p); load(p, eventFilter) }}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
