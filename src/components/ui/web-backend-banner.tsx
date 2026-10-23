import { AlertTriangle, RefreshCw } from 'lucide-react'
import { isWebApiUnavailableError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

interface WebBackendBannerProps {
  error: unknown
}

/** Shown in browser mode when the page loaded but Kessai's local web server stopped answering. */
export function WebBackendBanner({ error }: WebBackendBannerProps) {
  if (!isWebApiUnavailableError(error)) {
    return null
  }

  return (
    <Card
      tone="warning"
      padding="sm"
      role="alert"
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AlertTriangle className="text-warning mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-foreground text-sm font-medium">Can&rsquo;t reach Kessai</p>
          <p className="text-muted-foreground text-sm">
            The local server isn&rsquo;t responding. Make sure Kessai is running on this computer,
            then reload. Developers: start it with{' '}
            <code className="font-[family-name:var(--font-mono)] text-xs">pnpm dev:web</code>.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:self-center"
        onClick={() => window.location.reload()}
      >
        <RefreshCw aria-hidden="true" />
        Reload
      </Button>
    </Card>
  )
}
