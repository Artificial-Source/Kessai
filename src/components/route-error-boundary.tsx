import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorDetails } from '@/components/error-details'

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

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('RouteErrorBoundary caught an error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center py-8">
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            headingLevel="h1"
            title="This page crashed"
            description="Something on this page failed to draw. The rest of Kessai still works, and your data was not changed."
            action={
              <>
                <Button onClick={this.handleReset}>
                  <RefreshCw aria-hidden="true" />
                  Try again
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/">Go to Dashboard</Link>
                </Button>
              </>
            }
            className="w-full max-w-xl"
          >
            {this.state.error ? <ErrorDetails message={this.state.error.message} /> : null}
          </EmptyState>
        </div>
      )
    }

    return this.props.children
  }
}
