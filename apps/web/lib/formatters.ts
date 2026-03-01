import { Decimal } from '@prisma/client/runtime/library'

export function formatCurrency(amount: number | Decimal): string {
  const num = typeof amount === 'number' ? amount : Number(amount)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num)
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 30) return `${diffDays}d ago`
  return formatDate(d)
}

export function getHealthColor(score: number): string {
  if (score >= 90) return 'text-green-600'
  if (score >= 70) return 'text-yellow-600'
  return 'text-red-600'
}

export function getHealthBgColor(score: number): string {
  if (score >= 90) return 'bg-green-100'
  if (score >= 70) return 'bg-yellow-100'
  return 'bg-red-100'
}

export function getStatusColor(status: string): string {
  switch (status.toUpperCase()) {
    case 'AVAILABLE':
      return 'bg-green-100 text-green-800'
    case 'BUSY':
      return 'bg-red-100 text-red-800'
    case 'LIMITED':
      return 'bg-yellow-100 text-yellow-800'
    case 'PENDING':
      return 'bg-gray-100 text-gray-800'
    case 'RUNNING':
      return 'bg-blue-100 text-blue-800'
    case 'COMPLETE':
      return 'bg-green-100 text-green-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
