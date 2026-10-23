import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/error-details'

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
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
        <main className="bg-background flex min-h-dvh items-center justify-center p-6">
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            headingLevel="h1"
            title="Kessai hit an unexpected error"
            description="The screen failed to draw. Your saved data stays on this device; reload the app to continue."
            action={
              <>
                <Button onClick={this.handleReload}>
                  <RefreshCw aria-hidden="true" />
                  Reload app
                </Button>
                <Button variant="outline" onClick={this.handleReset}>
                  Try again
                </Button>
              </>
            }
            className="w-full max-w-lg"
          >
            {this.state.error ? <ErrorDetails message={this.state.error.message} /> : null}
          </EmptyState>
        </main>
      )
    }

    return this.props.children
  }
}
