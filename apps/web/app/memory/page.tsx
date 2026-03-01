import { prisma } from '@/lib/db'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { StakeForm } from '@/components/stake-form'
import { formatCurrency } from '@/lib/formatters'
import { Cpu, DollarSign, HardDrive, Layers } from 'lucide-react'

export default async function MemoryPage() {
  const user = await prisma.user.findFirst({ where: { email: 'demo@gp4u.com' } })
  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <p>User not found. Please run the seed script.</p>
      </div>
    )
  }

  const [stakes, availableGpus] = await Promise.all([
    prisma.memoryStake.findMany({
      where:   { userId: user.id },
      include: { gpu: { select: { id: true, name: true, provider: true, region: true, vramGB: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.gPU.findMany({
      where:   { status: 'AVAILABLE' },
      select:  { id: true, name: true, provider: true, region: true, vramGB: true, pricePerHour: true },
      orderBy: { pricePerHour: 'asc' },
      take:    20,
    }),
  ])

  const activeStakes    = stakes.filter(s => s.is_active)
  const totalVramStaked = activeStakes.reduce((s, m) => s + m.vram_gb, 0)
  const totalRamStaked  = activeStakes.reduce((s, m) => s + m.ram_gb, 0)
  const totalEarned     = activeStakes.reduce((s, m) => s + Number(m.total_earned_usd), 0)
  const totalAllocated  = activeStakes.reduce((s, m) => s + m.allocation_count, 0)

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Memory Staking</h1>
        <p className="text-muted-foreground">
          Stake idle VRAM and RAM to earn passive yield. Powered by the Mnemo Chamber.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <HardDrive className="h-4 w-4 text-cyan-600" />
              <span className="text-sm text-muted-foreground">VRAM Staked</span>
            </div>
            <div className="text-2xl font-bold">{totalVramStaked} GB</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="h-4 w-4 text-indigo-600" />
              <span className="text-sm text-muted-foreground">RAM Staked</span>
            </div>
            <div className="text-2xl font-bold">{totalRamStaked} GB</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm text-muted-foreground">Total Earned</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalEarned)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-1">
              <Cpu className="h-4 w-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Allocations</span>
            </div>
            <div className="text-2xl font-bold">{totalAllocated}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Active stakes */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Your Stakes</h2>
          {stakes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <HardDrive className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground mb-4">
                  No stakes yet. Stake idle VRAM to start earning.
                </p>
              </CardContent>
            </Card>
          ) : (
            stakes.map(stake => (
              <Card key={stake.id} className={!stake.is_active ? 'opacity-60' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold">{stake.gpu.name}</span>
                        <Badge variant="outline" className="text-xs">{stake.gpu.provider}</Badge>
                        <Badge variant="outline" className="text-xs">{stake.gpu.region}</Badge>
                      </div>
                      <div className="grid grid-cols-3 gap-3 mt-2 text-sm">
                        <div>
                          <div className="text-muted-foreground">VRAM</div>
                          <div className="font-medium">{stake.vram_gb} GB</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">RAM</div>
                          <div className="font-medium">{stake.ram_gb} GB</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Ask price</div>
                          <div className="font-medium font-mono text-xs">
                            ${Number(stake.asking_price_per_gb_sec).toFixed(8)}/GB·s
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span className="text-green-600 font-medium">
                          Earned: {formatCurrency(Number(stake.total_earned_usd))}
                        </span>
                        <span className="text-muted-foreground">
                          {stake.allocation_count} allocation{stake.allocation_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <Badge
                      className={stake.is_active
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : 'bg-gray-100 text-gray-500 border-gray-300'}
                    >
                      {stake.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Stake form */}
        <div>
          <StakeForm gpus={availableGpus.map(g => ({
            id:          g.id,
            name:        g.name,
            provider:    String(g.provider),
            region:      g.region,
            vramGB:      g.vramGB,
            pricePerHour: Number(g.pricePerHour),
          }))} />
        </div>
      </div>
    </div>
  )
}
