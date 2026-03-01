import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatRelativeTime, getStatusColor } from '@/lib/formatters'
import type { Job, GPU } from '@prisma/client'
import { Clock, Cpu, DollarSign } from 'lucide-react'

type JobWithGPU = Job & { gpu: GPU }

export function JobCard({ job }: { job: JobWithGPU }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{job.name}</CardTitle>
            <CardDescription>{formatRelativeTime(job.createdAt)}</CardDescription>
          </div>
          <Badge className={getStatusColor(job.status)}>{job.status}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{job.gpu.name}</span>
          <Badge variant="outline" className="ml-auto">
            {job.gpu.provider}
          </Badge>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Duration:</span>
          <span className="font-medium">{Number(job.expectedDurationHours).toFixed(1)}h</span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Estimated Cost:</span>
          <span className="font-medium">{formatCurrency(job.costEstimate)}</span>
        </div>

        {job.scriptPath && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground">Script: {job.scriptPath}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
