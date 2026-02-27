import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, Briefcase, TrendingDown, Clock } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

type StatsProps = {
  totalSpend: number
  jobCount: number
  avgJobDuration: number
  potentialSavings: number
}

export function DashboardStats({
  totalSpend,
  jobCount,
  avgJobDuration,
  potentialSavings,
}: StatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
          <DollarSign className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div>
          <p className="text-xs text-muted-foreground">Lifetime GPU compute costs</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Jobs Run</CardTitle>
          <Briefcase className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{jobCount}</div>
          <p className="text-xs text-muted-foreground">Total jobs executed</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{avgJobDuration.toFixed(1)}h</div>
          <p className="text-xs text-muted-foreground">Per job average</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Savings</CardTitle>
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatCurrency(potentialSavings)}
          </div>
          <p className="text-xs text-muted-foreground">Via cross-cloud arbitrage</p>
        </CardContent>
      </Card>
    </div>
  )
}
