import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, TrendingDown, Shield, Zap } from 'lucide-react'

export default function HomePage() {
  return (
    <div className="container mx-auto px-4 py-16">
      {/* Hero Section */}
      <div className="text-center space-y-6 mb-16">
        <h1 className="text-5xl font-bold tracking-tight">
          GPU Rental Made Simple
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Find the best GPU deals across AWS, GCP, Azure, Lambda Labs, and RunPod.
          Track health, compare prices, and deploy instantly.
        </p>
        <div className="flex gap-4 justify-center">
          <Button asChild size="lg">
            <Link href="/marketplace">Browse Marketplace</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/arbitrage">Compare Prices</Link>
          </Button>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
        <Card>
          <CardHeader>
            <Activity className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>GPU Marketplace</CardTitle>
            <CardDescription>
              Browse and rent GPUs from multiple cloud providers in one place
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <TrendingDown className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Price Arbitrage</CardTitle>
            <CardDescription>
              Automatically find the cheapest GPU across all providers
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Shield className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Health Tracking</CardTitle>
            <CardDescription>
              CarFax for GPUs - see thermal, memory scores, and usage history
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <Zap className="h-8 w-8 mb-2 text-primary" />
            <CardTitle>Quick Deploy</CardTitle>
            <CardDescription>
              Launch your training jobs and inference workloads instantly
            </CardDescription>
          </CardHeader>
        </Card>
      </div>

      {/* Stats Section */}
      <Card className="bg-muted">
        <CardContent className="pt-6">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-4xl font-bold mb-2">5+</div>
              <div className="text-muted-foreground">Cloud Providers</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">10+</div>
              <div className="text-muted-foreground">GPU Models</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">40%</div>
              <div className="text-muted-foreground">Avg. Cost Savings</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA Section */}
      <div className="mt-16 text-center space-y-4">
        <h2 className="text-3xl font-bold">Ready to get started?</h2>
        <p className="text-muted-foreground">
          Create your first job and start saving on GPU compute today.
        </p>
        <Button asChild size="lg">
          <Link href="/dashboard">Go to Dashboard</Link>
        </Button>
      </div>
    </div>
  )
}
