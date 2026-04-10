import { AlertTriangle } from 'lucide-react'
import { isWebApiUnavailableError } from '@/lib/api'

interface WebBackendBannerProps {
  error: unknown
}

export function WebBackendBanner({ error }: WebBackendBannerProps) {
  if (!isWebApiUnavailableError(error)) {
    return null
  }

  return (
    <div className="glass-card border-warning/20 bg-warning/5 flex items-center gap-3 p-4">
      <AlertTriangle className="text-warning h-4 w-4 shrink-0" />
      <p className="text-muted-foreground text-sm">
        Web API is not running. Start browser mode with `pnpm dev:web`.
      </p>
    </div>
  )
}
