import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatDate, formatNumber, getHealthColor, getHealthBgColor } from '@/lib/formatters'
import type { GPUHealth } from '@prisma/client'
import { Activity, Thermometer, HardDrive, Clock } from 'lucide-react'

export function GPUHealthWidget({ health }: { health: GPUHealth }) {
  const usageTags = health.pastUsageTags.split(',').filter(Boolean)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          GPU Health & Provenance
        </CardTitle>
        <CardDescription>
          CarFax-style health report for this GPU
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Scores */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Thermometer className="h-4 w-4" />
              Thermal Health
            </div>
            <div className="flex items-center gap-2">
              <div className={`text-3xl font-bold ${getHealthColor(health.thermalScore)}`}>
                {health.thermalScore}
              </div>
              <span className="text-muted-foreground">/100</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${getHealthBgColor(health.thermalScore)}`}
                style={{ width: `${health.thermalScore}%` }}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <HardDrive className="h-4 w-4" />
              Memory Health
            </div>
            <div className="flex items-center gap-2">
              <div className={`text-3xl font-bold ${getHealthColor(health.memoryScore)}`}>
                {health.memoryScore}
              </div>
              <span className="text-muted-foreground">/100</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${getHealthBgColor(health.memoryScore)}`}
                style={{ width: `${health.memoryScore}%` }}
              />
            </div>
          </div>
        </div>

        {/* Uptime & Maintenance */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-muted-foreground mb-1">Total Uptime</div>
            <div className="text-xl font-semibold">
              {formatNumber(health.uptimeHours)} hrs
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-1">Last Maintenance</div>
            <div className="text-sm font-medium">
              {formatDate(health.lastMaintenanceAt)}
            </div>
          </div>
        </div>

        {/* Usage History */}
        <div className="pt-4 border-t">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Clock className="h-4 w-4" />
            Past Usage Profile
          </div>
          <div className="flex flex-wrap gap-2">
            {usageTags.map((tag, i) => (
              <Badge key={i} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        {/* Overall Assessment */}
        <div className="pt-4 border-t">
          <div className="text-sm font-medium mb-2">Overall Assessment</div>
          <div className="text-sm text-muted-foreground">
            {health.thermalScore >= 90 && health.memoryScore >= 90 && (
              <span className="text-green-600 font-medium">
                Excellent condition - This GPU shows minimal wear and optimal performance metrics.
              </span>
            )}
            {((health.thermalScore >= 70 && health.thermalScore < 90) ||
              (health.memoryScore >= 70 && health.memoryScore < 90)) && (
              <span className="text-yellow-600 font-medium">
                Good condition - This GPU is performing well with normal wear for its uptime.
              </span>
            )}
            {(health.thermalScore < 70 || health.memoryScore < 70) && (
              <span className="text-red-600 font-medium">
                Needs attention - This GPU may benefit from maintenance or closer monitoring.
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
