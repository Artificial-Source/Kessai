import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Copy, Loader2, RotateCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FieldError, FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { SettingRow, SettingsSection } from '@/components/settings/settings-section'
import { cn } from '@/lib/utils'
import {
  applyPrivateWebAccess,
  getPrivateWebAccessStatus,
  type PrivateWebAccessState,
  type PrivateWebAccessStatus,
} from '@/lib/private-web-access'
import { isTauriRuntime } from '@/lib/runtime'

const POLL_INTERVAL_MS = 5_000

const statusCopy: Record<PrivateWebAccessState, string> = {
  stopped: 'Stopped',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  error: 'Error',
}

function getPortError(port: string): string | null {
  if (!/^\d+$/.test(port)) {
    return 'Enter a whole-number port from 1024 to 65535.'
  }

  const value = Number(port)
  if (!Number.isInteger(value) || value < 1024 || value > 65535) {
    return 'Port must be between 1024 and 65535.'
  }

  return null
}

export function PrivateWebAccess() {
  if (!isTauriRuntime()) {
    return null
  }

  return <PrivateWebAccessDesktop />
}

function PrivateWebAccessDesktop() {
  const [status, setStatus] = useState<PrivateWebAccessStatus | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [draftEnabled, setDraftEnabled] = useState(false)
  const [draftPort, setDraftPort] = useState('')
  const [portError, setPortError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const isDraftDirty = useRef(false)
  const requestGeneration = useRef(0)
  const applyInFlight = useRef(false)

  const syncDraft = useCallback((nextStatus: PrivateWebAccessStatus) => {
    setDraftEnabled(nextStatus.enabled)
    setDraftPort(String(nextStatus.port))
    setPortError(null)
    isDraftDirty.current = false
  }, [])

  const loadStatus = useCallback(
    async (source: 'initial' | 'poll' | 'manual') => {
      if (applyInFlight.current) return
      const generation = ++requestGeneration.current
      try {
        const nextStatus = await getPrivateWebAccessStatus()
        if (generation !== requestGeneration.current) return
        setStatus(nextStatus)
        setRequestError(null)
        if (source !== 'poll' || !isDraftDirty.current) {
          syncDraft(nextStatus)
        }
      } catch (error) {
        if (generation !== requestGeneration.current) return
        setRequestError(
          error instanceof Error ? error.message : 'Unable to load local server status.'
        )
      }
    },
    [syncDraft]
  )

  useEffect(() => {
    void loadStatus('initial')
    return () => {
      requestGeneration.current += 1
    }
  }, [loadStatus])

  useEffect(() => {
    if (isApplying) return
    const timer = window.setInterval(() => void loadStatus('poll'), POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [isApplying, loadStatus])

  const updateEnabled = (enabled: boolean) => {
    isDraftDirty.current = true
    setDraftEnabled(enabled)
  }

  const updatePort = (port: string) => {
    isDraftDirty.current = true
    setDraftPort(port)
    setPortError(null)
  }

  const handleApply = async () => {
    if (applyInFlight.current) return

    const validationError = getPortError(draftPort)
    if (validationError) {
      setPortError(validationError)
      return
    }

    const generation = ++requestGeneration.current
    applyInFlight.current = true
    setIsApplying(true)
    try {
      const nextStatus = await applyPrivateWebAccess({
        enabled: draftEnabled,
        port: Number(draftPort),
      })
      if (generation !== requestGeneration.current) return
      setStatus(nextStatus)
      setRequestError(null)
      syncDraft(nextStatus)

      if (nextStatus.state === 'error' || nextStatus.error) {
        toast.error(nextStatus.error ?? 'Kessai could not update private web access.')
      } else {
        toast.success(draftEnabled ? 'Private web access enabled' : 'Private web access stopped')
      }
    } catch (error) {
      if (generation !== requestGeneration.current) return
      const message =
        error instanceof Error ? error.message : 'Unable to update private web access.'
      setRequestError(message)
      toast.error(message)
    } finally {
      if (generation === requestGeneration.current) {
        applyInFlight.current = false
        setIsApplying(false)
      }
    }
  }

  const handleServeCommandCopy = async () => {
    if (!status?.serveCommand || !navigator.clipboard?.writeText) {
      toast.error('Could not copy the Serve command.')
      return
    }

    try {
      await navigator.clipboard.writeText(status.serveCommand)
      toast.success('Serve command copied')
    } catch {
      toast.error('Could not copy the Serve command.')
    }
  }

  const handleAccessKeyCopy = async () => {
    if (!status?.accessKey || !navigator.clipboard?.writeText) {
      toast.error('Could not copy the access key.')
      return
    }

    try {
      await navigator.clipboard.writeText(status.accessKey)
      toast.success('Access key copied')
    } catch {
      toast.error('Could not copy the access key.')
    }
  }

  const isLoading = status === null && requestError === null
  const isTransitioning = status?.state === 'starting' || status?.state === 'stopping'
  const isBusy = isApplying || isTransitioning
  const statusError = status?.error ?? null
  const displayedError = statusError ?? requestError

  return (
    <SettingsSection
      id="web-access"
      title="Private Web Access"
      description="Reach Kessai privately via Tailscale from your own devices."
    >
      {isLoading ? (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading Private Web Access">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={cn(
                  'size-2.5 shrink-0 rounded-full',
                  status?.state === 'running'
                    ? 'bg-primary'
                    : status?.state === 'error'
                      ? 'bg-destructive'
                      : 'bg-muted-foreground'
                )}
                aria-hidden="true"
              />
              <dl className="flex flex-col gap-0.5">
                <dt className="type-label text-muted-foreground">Local server</dt>
                <dd
                  className="text-foreground text-sm font-medium"
                  role="status"
                  aria-live="polite"
                >
                  {status ? statusCopy[status.state] : 'Unavailable'}
                </dd>
              </dl>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadStatus('manual')}
              disabled={isBusy}
            >
              <RotateCw className={isBusy ? 'animate-spin' : ''} aria-hidden="true" />
              {requestError || status?.state === 'error' ? 'Retry' : 'Refresh'}
            </Button>
          </div>

          {displayedError ? (
            <p
              className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm"
              role="alert"
            >
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {displayedError}
            </p>
          ) : null}

          <div className="border-border flex flex-col gap-5 border-t pt-5">
            <SettingRow
              label="Enable private local server"
              htmlFor="private-web-access-enabled"
              description="Starts a private local Kessai server. It does not run or configure Tailscale."
            >
              <Switch
                id="private-web-access-enabled"
                aria-label="Enable Private Web Access"
                checked={draftEnabled}
                onCheckedChange={updateEnabled}
                disabled={!status || isBusy}
              />
            </SettingRow>

            <div className="flex flex-col gap-2">
              <Label htmlFor="private-web-access-port">Local port</Label>
              <Input
                id="private-web-access-port"
                value={draftPort}
                onChange={(event) => updatePort(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={
                  portError ? 'private-web-access-port-error' : 'private-web-access-port-hint'
                }
                aria-invalid={Boolean(portError)}
                disabled={!status || isBusy}
                className="sm:w-40"
              />
              {portError ? (
                <FieldError id="private-web-access-port-error">{portError}</FieldError>
              ) : (
                <FieldHint id="private-web-access-port-hint">
                  A whole number from 1024 to 65535.
                </FieldHint>
              )}
            </div>

            <Button
              onClick={() => void handleApply()}
              disabled={!status || isBusy}
              aria-busy={isBusy}
              className="self-start"
            >
              {isBusy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              Apply changes
            </Button>
          </div>

          {status?.enabled && status.accessKey ? (
            <div className="border-border flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                  <h3 className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
                    Access key
                  </h3>
                  <p className="text-muted-foreground text-xs text-pretty">
                    Each browser asks for this once. Disabling and re-enabling access rotates it and
                    revokes existing browser sessions.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Copy access key"
                  onClick={() => void handleAccessKeyCopy()}
                >
                  <Copy aria-hidden="true" />
                  Copy
                </Button>
              </div>
              <code
                aria-label="Private Web Access key"
                className="border-input-border bg-input block rounded-md border p-3 font-[family-name:var(--font-mono)] text-xs break-all whitespace-pre-wrap"
              >
                {status.accessKey}
              </code>
            </div>
          ) : null}

          {status?.serveCommand ? (
            <div className="border-border flex flex-col gap-3 border-t pt-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
                  <h3 className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
                    Tailscale Serve command
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Run this on the host after enabling access.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Copy Tailscale Serve command"
                  onClick={() => void handleServeCommandCopy()}
                >
                  <Copy aria-hidden="true" />
                  Copy
                </Button>
              </div>
              <pre className="border-input-border bg-input overflow-x-auto rounded-md border p-3 font-[family-name:var(--font-mono)] text-xs whitespace-pre-wrap">
                <code>{status.serveCommand}</code>
              </pre>
            </div>
          ) : null}

          <div className="border-border grid gap-5 border-t pt-5 lg:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
                Connect via Tailscale
              </h3>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-4 text-xs">
                <li>Install and sign into Tailscale on this host and each accessing device.</li>
                <li>Run or copy the Serve command above.</li>
                <li>Open the URL printed by Tailscale.</li>
                <li>Paste the access key above into the Kessai access page.</li>
                <li>Your tailnet policy controls who can reach the access page.</li>
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              <h3 className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
                Keep the host available
              </h3>
              <p className="text-muted-foreground text-xs text-pretty">
                Kessai must keep running; closing to the tray is okay. Quit stops Kessai’s local
                server, but the background Tailscale configuration persists until{' '}
                <code className="font-[family-name:var(--font-mono)]">tailscale serve reset</code>.
              </p>
            </div>
          </div>

          <p className="border-destructive/30 bg-destructive/5 text-foreground flex items-start gap-3 rounded-lg border p-4 text-sm">
            <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              <strong>Never use Tailscale Funnel.</strong> Funnel exposes services publicly, and
              Kessai rejects Funnel requests.
            </span>
          </p>

          <p className="text-muted-foreground text-xs">
            This status only reports Kessai’s local server. Kessai does not detect whether Tailscale
            itself is active.
          </p>
        </div>
      )}
    </SettingsSection>
  )
}
