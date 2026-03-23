import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="bg-background flex min-h-screen items-center justify-center p-8">
          <div className="glass-card max-w-md rounded-2xl p-8 text-center">
            <div className="bg-destructive/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
              <AlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <h1 className="text-foreground mb-2 text-xl font-bold">Something went wrong</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              An unexpected error occurred. Please try refreshing the page or contact support if the
              problem persists.
            </p>
            {this.state.error && (
              <details className="bg-muted/50 mb-6 rounded-lg p-3 text-left">
                <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
                  Error details
                </summary>
                <pre className="text-destructive mt-2 overflow-auto text-xs">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={this.handleReset} className="flex-1">
                Try Again
              </Button>
              <Button variant="default" onClick={this.handleReload} className="flex-1 gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
