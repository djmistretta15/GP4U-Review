import { prisma } from '@/lib/db'
import { GPUCard } from '@/components/gpu-card'

export default async function MarketplacePage() {
  const gpus = await prisma.gpu.findMany({
    include: {
      health: true,
    },
    orderBy: {
      pricePerHour: 'asc',
    },
  })

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">GPU Marketplace</h1>
        <p className="text-muted-foreground">
          Browse available GPUs across multiple cloud providers
        </p>
      </div>

      <div className="mb-6 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Showing {gpus.length} GPUs
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {gpus.map((gpu) => (
          <GPUCard key={gpu.id} gpu={gpu} />
        ))}
      </div>

      {gpus.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No GPUs available at the moment.</p>
        </div>
      )}
    </div>
  )
}
