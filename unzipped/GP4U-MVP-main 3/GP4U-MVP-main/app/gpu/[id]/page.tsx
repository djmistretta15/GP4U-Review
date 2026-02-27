import { notFound } from 'next/navigation'
import Link from 'next/link'
import { prisma } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GPUHealthWidget } from '@/components/gpu-health-widget'
import { formatCurrency, getStatusColor } from '@/lib/formatters'
import { ArrowLeft, Server, MapPin, Cpu } from 'lucide-react'

export default async function GPUDetailsPage({
  params,
}: {
  params: { id: string }
}) {
  const gpu = await prisma.gpu.findUnique({
    where: { id: params.id },
    include: {
      health: true,
    },
  })

  if (!gpu) {
    notFound()
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Back Button */}
      <Button asChild variant="ghost" className="mb-6">
        <Link href="/marketplace">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Marketplace
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{gpu.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-base">
                {gpu.provider}
              </Badge>
              <Badge className={`text-base ${getStatusColor(gpu.status)}`}>
                {gpu.status}
              </Badge>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground mb-1">Price per hour</div>
            <div className="text-3xl font-bold">{formatCurrency(gpu.pricePerHour)}</div>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* GPU Specifications */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Specifications</CardTitle>
              <CardDescription>Hardware details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cpu className="h-4 w-4" />
                  Model
                </div>
                <div className="font-medium">{gpu.name}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Server className="h-4 w-4" />
                  VRAM
                </div>
                <div className="font-medium">{gpu.vramGB} GB</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  Region
                </div>
                <div className="font-medium">{gpu.region}</div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">Provider</div>
                <div className="font-medium">{gpu.provider}</div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">Status</div>
                <Badge className={getStatusColor(gpu.status)}>{gpu.status}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Card */}
          <Card>
            <CardHeader>
              <CardTitle>Pricing</CardTitle>
              <CardDescription>Cost estimates</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">1 hour</span>
                <span className="font-medium">{formatCurrency(gpu.pricePerHour)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">8 hours</span>
                <span className="font-medium">
                  {formatCurrency(Number(gpu.pricePerHour) * 8)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">24 hours</span>
                <span className="font-medium">
                  {formatCurrency(Number(gpu.pricePerHour) * 24)}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-3 border-t">
                <span className="text-muted-foreground">30 days</span>
                <span className="font-bold">
                  {formatCurrency(Number(gpu.pricePerHour) * 24 * 30)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Action Button */}
          <Button asChild className="w-full" size="lg" disabled={gpu.status === 'BUSY'}>
            <Link href={`/jobs?gpuId=${gpu.id}`}>
              {gpu.status === 'BUSY' ? 'Currently Unavailable' : 'Rent this GPU'}
            </Link>
          </Button>
        </div>

        {/* Health Information */}
        <div className="lg:col-span-2">
          {gpu.health ? (
            <GPUHealthWidget health={gpu.health} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  Health data not available for this GPU
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
