'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency } from '@/lib/formatters'
import type { ArbitrageResult } from '@/lib/arbitrage'
import { TrendingDown, TrendingUp } from 'lucide-react'

export function ArbitrageTable({ results }: { results: ArbitrageResult[] }) {
  if (results.length === 0) {
    return null
  }

  const bestPrice = results[0].totalCost

  return (
    <Card>
      <CardHeader>
        <CardTitle>Price Comparison</CardTitle>
        <CardDescription>
          Sorted by total cost (lowest to highest)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Price/Hour</TableHead>
              <TableHead>Total Cost</TableHead>
              <TableHead>Savings</TableHead>
              <TableHead>Availability</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, index) => {
              const isBest = index === 0
              const savingsAmount = result.totalCost - bestPrice
              const savingsPercent =
                bestPrice > 0 ? ((savingsAmount / bestPrice) * 100).toFixed(1) : '0'

              return (
                <TableRow key={result.provider} className={isBest ? 'bg-green-50' : ''}>
                  <TableCell>
                    {isBest && (
                      <div className="flex items-center gap-1 text-green-600 font-bold">
                        <TrendingDown className="h-4 w-4" />
                        #{index + 1}
                      </div>
                    )}
                    {!isBest && <span className="text-muted-foreground">#{index + 1}</span>}
                  </TableCell>
                  <TableCell className="font-medium">
                    {result.provider}
                    {isBest && (
                      <Badge className="ml-2 bg-green-600">Best Deal</Badge>
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(result.pricePerHour)}</TableCell>
                  <TableCell className="font-semibold">
                    {formatCurrency(result.totalCost)}
                  </TableCell>
                  <TableCell>
                    {isBest ? (
                      <span className="text-green-600 font-medium">—</span>
                    ) : (
                      <div className="flex items-center gap-1 text-red-600">
                        <TrendingUp className="h-3 w-3" />
                        <span className="text-sm">
                          +{formatCurrency(savingsAmount)} (+{savingsPercent}%)
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {result.available ? (
                      <Badge className="bg-green-100 text-green-800">Available</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800">Limited</Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
