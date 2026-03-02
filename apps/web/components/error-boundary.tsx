'use client'

/**
 * Error Boundary — catches React render errors in client components.
 *
 * Usage:
 *   <ErrorBoundary fallback={<p>Something went wrong.</p>}>
 *     <SomeComponent />
 *   </ErrorBoundary>
 *
 * Or wrap entire page sections in layout.tsx for global coverage.
 */

import React from 'react'

interface Props {
  children:  React.ReactNode
  fallback?: React.ReactNode
  /** Optional callback for error logging (e.g., Sentry) */
  onError?:  (error: Error, info: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error:    Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
    this.props.onError?.(error, info)
    // Send to Sentry if configured (dynamic import — doesn't block render)
    import('@/lib/monitoring').then(m => m.captureClientError(error, 'ErrorBoundary')).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-red-900/50 bg-red-950/20 p-8">
          <div className="text-center">
            <p className="text-sm font-medium text-red-400">Something went wrong</p>
            <p className="mt-1 text-xs text-slate-500">
              {this.state.error?.message ?? 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-md bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Convenience wrapper with a standard full-page fallback.
 * Use this in layout.tsx to catch top-level errors.
 */
export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]">
          <div className="text-center">
            <p className="text-lg font-semibold text-white">Something went wrong</p>
            <p className="mt-2 text-sm text-slate-400">
              Reload the page or{' '}
              <a href="mailto:support@gp4u.com" className="text-green-400 hover:underline">
                contact support
              </a>
              .
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700"
            >
              Reload page
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  )
}
