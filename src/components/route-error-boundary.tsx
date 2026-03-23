import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('RouteErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-8">
          <div className="glass-card max-w-md rounded-2xl p-8 text-center">
            <div className="bg-destructive/10 mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full">
              <AlertTriangle className="text-destructive h-8 w-8" />
            </div>
            <h1 className="text-foreground mb-2 font-[family-name:var(--font-heading)] text-xl font-bold">
              This page crashed
            </h1>
            <p className="text-muted-foreground mb-6 font-[family-name:var(--font-sans)] text-sm">
              An error occurred while rendering this page. The rest of the app should still work.
            </p>
            {this.state.error && (
              <details className="bg-muted/50 mb-6 rounded-lg p-3 text-left">
                <summary className="text-muted-foreground cursor-pointer font-[family-name:var(--font-mono)] text-xs font-medium">
                  Error details
                </summary>
                <pre className="text-destructive mt-2 overflow-auto font-[family-name:var(--font-mono)] text-xs">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <Button variant="default" onClick={this.handleReset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
