import { useEffect, useState } from 'react'
import { AlertTriangle, Network, ShieldCheck } from 'lucide-react'
import { apiInvoke } from '@/lib/api'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export type WebAccessStatus = {
  server_mode: 'standalone' | 'private_hosted' | 'tailscale_hosted'
  connection: 'local' | 'tailscale'
  tailscale_login: string | null
}

type LoadState =
  { kind: 'loading' } | { kind: 'ready'; status: WebAccessStatus } | { kind: 'error' }

/** How this browser reached Kessai's web server (browser mode only). */
export function AccessStatus() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    apiInvoke('get_access_status')
      .then((status) => {
        if (active) setState({ kind: 'ready', status })
      })
      .catch(() => {
        if (active) setState({ kind: 'error' })
      })
    return () => {
      active = false
    }
  }, [])

  if (state.kind === 'loading') {
    return (
      <Card className="flex items-center gap-3" aria-busy="true">
        <Skeleton className="size-10 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <p className="text-muted-foreground text-sm" role="status">
            Checking web connection…
          </p>
          <Skeleton className="h-3 w-48" />
        </div>
      </Card>
    )
  }

  if (state.kind === 'error') {
    return (
      <Card tone="danger" className="flex items-start gap-3" role="alert">
        <span className="border-destructive/30 bg-destructive/12 text-destructive flex size-10 shrink-0 items-center justify-center rounded-md border">
          <AlertTriangle className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-foreground text-base font-bold">Connection status unavailable</h2>
          <p className="text-muted-foreground text-sm">
            Kessai could not confirm how this browser reached the web server.
          </p>
        </div>
      </Card>
    )
  }

  const { status } = state
  const throughTailscale = status.connection === 'tailscale'
  const Icon = throughTailscale ? ShieldCheck : Network
  return (
    <Card asChild>
      <section className="flex items-start gap-3" aria-label="Web access status">
        <span className="border-border-hover bg-accent-muted text-foreground flex size-10 shrink-0 items-center justify-center rounded-md border">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-foreground text-base font-bold">
            {throughTailscale ? 'Connected through Tailscale' : 'Connected locally'}
          </h2>
          {throughTailscale && status.tailscale_login ? (
            <p className="text-muted-foreground truncate text-sm" title={status.tailscale_login}>
              Signed in as <span className="text-foreground">{status.tailscale_login}</span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              {status.server_mode === 'standalone'
                ? 'Standalone web server on this machine'
                : 'Direct connection to the hosted web server'}
            </p>
          )}
        </div>
      </section>
    </Card>
  )
}
