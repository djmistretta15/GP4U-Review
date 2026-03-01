import { Provider } from '@prisma/client'

// Mock pricing data for arbitrage calculations
// In production, this would pull from real APIs or database
export const GPU_PRICING = {
  'A100-80GB': {
    [Provider.AWS]: 4.10,
    [Provider.GCP]: 3.93,
    [Provider.AZURE]: 4.25,
    [Provider.LAMBDA]: 3.50,
    [Provider.RUNPOD]: 3.29,
  },
  'A100-40GB': {
    [Provider.AWS]: 3.06,
    [Provider.GCP]: 2.93,
    [Provider.AZURE]: 3.15,
    [Provider.LAMBDA]: 2.75,
    [Provider.RUNPOD]: 2.49,
  },
  'H100': {
    [Provider.AWS]: 5.20,
    [Provider.GCP]: 4.95,
    [Provider.AZURE]: 4.53,
    [Provider.LAMBDA]: 2.49,
    [Provider.RUNPOD]: 2.79,
  },
  'RTX-4090': {
    [Provider.AWS]: 1.20,
    [Provider.GCP]: 1.15,
    [Provider.LAMBDA]: 0.74,
    [Provider.RUNPOD]: 0.69,
  },
  'L40S': {
    [Provider.RUNPOD]: 1.29,
    [Provider.LAMBDA]: 1.49,
    [Provider.GCP]: 2.10,
  },
}

export type ArbitrageResult = {
  provider: Provider
  pricePerHour: number
  totalCost: number
  available: boolean
  savingsVsBest?: number
}

export function calculateArbitrage(
  gpuType: string,
  numGpus: number,
  durationHours: number
): ArbitrageResult[] {
  const pricing = GPU_PRICING[gpuType as keyof typeof GPU_PRICING] || {}

  const results: ArbitrageResult[] = []

  for (const [provider, pricePerHour] of Object.entries(pricing)) {
    const totalCost = pricePerHour * numGpus * durationHours
    // Mock availability - 80% chance of being available
    const available = Math.random() > 0.2

    results.push({
      provider: provider as Provider,
      pricePerHour,
      totalCost,
      available,
    })
  }

  // Sort by total cost (cheapest first)
  results.sort((a, b) => a.totalCost - b.totalCost)

  // Calculate savings vs best price
  const bestPrice = results[0]?.totalCost || 0
  results.forEach((result, index) => {
    if (index > 0) {
      result.savingsVsBest = result.totalCost - bestPrice
    }
  })

  return results
}

export function getBestDeal(): { gpuType: string; provider: Provider; pricePerHour: number } | null {
  // Find the best overall deal across all GPU types
  let bestDeal: { gpuType: string; provider: Provider; pricePerHour: number } | null = null
  let lowestPrice = Infinity

  for (const [gpuType, providers] of Object.entries(GPU_PRICING)) {
    for (const [provider, price] of Object.entries(providers)) {
      if (price < lowestPrice) {
        lowestPrice = price
        bestDeal = {
          gpuType,
          provider: provider as Provider,
          pricePerHour: price,
        }
      }
    }
  }

  return bestDeal
}

export const GPU_TYPES = Object.keys(GPU_PRICING)
