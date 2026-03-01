import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChamberControlPanel } from '@/components/chamber-control-panel'
import { LedgerExplorer } from '@/components/ledger-explorer'
import {
  Activity, Database, Zap, Shield, GitBranch, Terminal,
} from 'lucide-react'

// Colour map for chamber modes
const MODE_COLOURS: Record<string, string> = {
  ACTIVE:   'bg-green-100 text-green-800 border-green-300',
  PASSIVE:  'bg-yellow-100 text-yellow-800 border-yellow-300',
  BACKTEST: 'bg-blue-100 text-blue-800 border-blue-300',
  OFFLINE:  'bg-gray-100 text-gray-500 border-gray-300',
}

const HEALTH_COLOURS: Record<string, string> = {
  HEALTHY:  'bg-green-500',
  DEGRADED: 'bg-yellow-500',
  OFFLINE:  'bg-gray-400',
}

export default async function AdminPage() {
  // Pull chamber states and ledger summary from DB
  const [chamberStates, ledgerCount, disputeCount, authEventCount] = await Promise.all([
    prisma.chamberState.findMany({ orderBy: { chamber_id: 'asc' } }).catch(() => []),
    prisma.ledgerEntry.count().catch(() => 0),
    prisma.dispute.count().catch(() => 0),
    prisma.authEvent.count().catch(() => 0),
  ])

  const activeChambers  = chamberStates.filter(c => c.mode === 'ACTIVE').length
  const totalChambers   = chamberStates.length || 6

  const recentLedger = await prisma.ledgerEntry.findMany({
    orderBy: { block_index: 'desc' },
    take: 10,
    select: {
      entry_id: true, block_index: true, event_type: true,
      severity: true, subject_id: true, timestamp: true, block_hash: true,
    },
  }).catch(() => [])

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Terminal className="h-8 w-8 text-slate-700" />
          <h1 className="text-4xl font-bold">Platform Admin</h1>
        </div>
        <p className="text-muted-foreground">
          Chamber registry, Obsidian ledger, and platform diagnostics
        </p>
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Active Chambers</span>
            </div>
            <div className="text-3xl font-bold">{activeChambers}<span className="text-lg text-muted-foreground">/{totalChambers}</span></div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Database className="h-4 w-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Ledger Entries</span>
            </div>
            <div className="text-3xl font-bold">{ledgerCount.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Auth Events</span>
            </div>
            <div className="text-3xl font-bold">{authEventCount.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <GitBranch className="h-4 w-4 text-orange-600" />
              <span className="text-sm text-muted-foreground">Open Disputes</span>
            </div>
            <div className="text-3xl font-bold">{disputeCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        {/* Chamber Status Grid */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-amber-500" />
                Chamber Registry
              </CardTitle>
              <CardDescription>
                Live mode, event counts, and backtest scores for all docked chambers
              </CardDescription>
            </CardHeader>
            <CardContent>
              {chamberStates.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No chamber states in DB yet — run seed or wait for instrumentation.ts to bootstrap.
                </p>
              ) : (
                <div className="space-y-3">
                  {chamberStates.map(c => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`h-2.5 w-2.5 rounded-full ${HEALTH_COLOURS[c.mode === 'ACTIVE' ? 'HEALTHY' : c.mode === 'PASSIVE' ? 'DEGRADED' : 'OFFLINE']}`} />
                        <div>
                          <div className="font-medium capitalize">{c.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.events_received} events received
                            {c.backtest_score != null && ` · Score: ${c.backtest_score}`}
                            {c.last_event_at && ` · Last: ${new Date(c.last_event_at).toLocaleTimeString()}`}
                          </div>
                        </div>
                      </div>
                      <Badge className={`text-xs border ${MODE_COLOURS[c.mode] ?? MODE_COLOURS.OFFLINE}`}>
                        {c.mode}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Chamber Control Panel (client component) */}
        <div>
          <ChamberControlPanel />
        </div>
      </div>

      {/* Ledger Explorer */}
      <div className="mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              Obsidian Ledger
            </CardTitle>
            <CardDescription>
              Immutable hash-chained event log — {ledgerCount.toLocaleString()} entries total
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentLedger.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No ledger entries yet — events will appear here as the platform processes them.
              </p>
            ) : (
              <div className="space-y-2">
                {recentLedger.map(entry => (
                  <div
                    key={entry.entry_id}
                    className="flex items-start justify-between p-2 rounded border text-sm font-mono"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-blue-700">#{entry.block_index}</span>
                      {' · '}
                      <span className="text-purple-700">{entry.event_type}</span>
                      {entry.subject_id && (
                        <span className="text-muted-foreground"> · {entry.subject_id.slice(0, 8)}…</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      <Badge
                        variant="outline"
                        className={`text-xs ${entry.severity === 'CRITICAL' ? 'border-red-400 text-red-700' : entry.severity === 'WARN' ? 'border-yellow-400 text-yellow-700' : 'border-gray-300'}`}
                      >
                        {entry.severity}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Full ledger paginator (client) */}
      <LedgerExplorer initialCount={ledgerCount} />
    </div>
  )
}
