import Link from 'next/link'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, getStatusColor } from '@/lib/formatters'
import type { GPU, GPUHealth } from '@prisma/client'

type GPUWithHealth = GPU & { health: GPUHealth | null }

export function GPUCard({ gpu }: { gpu: GPUWithHealth }) {
  const healthScore = gpu.health
    ? Math.round((gpu.health.thermalScore + gpu.health.memoryScore) / 2)
    : 0

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{gpu.name}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{gpu.provider}</Badge>
              <Badge className={getStatusColor(gpu.status)}>{gpu.status}</Badge>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">VRAM</span>
            <span className="font-medium">{gpu.vramGB} GB</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Region</span>
            <span className="font-medium">{gpu.region}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Health Score</span>
            <span className="font-medium">{healthScore}/100</span>
          </div>
          <div className="flex justify-between border-t pt-2 mt-2">
            <span className="text-muted-foreground">Price</span>
            <span className="text-lg font-bold">{formatCurrency(gpu.pricePerHour)}/hr</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="gap-2">
        <Button asChild className="flex-1">
          <Link href={`/gpu/${gpu.id}`}>View Details</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
