import Link from 'next/link'
import { Activity } from 'lucide-react'

export function Navigation() {
  return (
    <header className="border-b bg-background">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center space-x-2">
            <Activity className="h-6 w-6" />
            <span className="text-xl font-bold">GP4U</span>
          </Link>

          <nav className="flex items-center space-x-6">
            <Link
              href="/marketplace"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Marketplace
            </Link>
            <Link
              href="/arbitrage"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Arbitrage
            </Link>
            <Link
              href="/jobs"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Jobs
            </Link>
            <Link
              href="/dashboard"
              className="text-sm font-medium transition-colors hover:text-primary"
            >
              Dashboard
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}
