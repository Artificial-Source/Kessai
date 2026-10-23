import { useEffect } from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useUpdateStore } from '@/stores/update-store'
import { version as bundledVersion } from '../../../package.json'

const statusLabels: Record<string, string> = {
  idle: 'Not checked yet',
  checking: 'Checking GitHub releases…',
  available: 'Update available',
  'up-to-date': 'Up to date',
  downloading: 'Downloading update…',
  installing: 'Installing update…',
  error: 'Update check failed',
  unsupported: 'Updater unavailable in this build',
}

/** Desktop-only updater block; the settings page renders it inside the Desktop App section. */
export function UpdateSettings() {
  const {
    support,
    status,
    currentVersion,
    latestVersion,
    releaseNotes,
    releaseDate,
    progress,
    error,
    initialize,
    checkForUpdates,
    installUpdate,
  } = useUpdateStore()

  useEffect(() => {
    void initialize()
  }, [initialize])

  const isBusy = status === 'checking' || status === 'downloading' || status === 'installing'
  const canInstall = status === 'available'

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <h3 className="text-foreground font-[family-name:var(--font-sans)] text-sm font-medium">
            Updates
          </h3>
          <p className="text-muted-foreground text-xs leading-relaxed text-pretty">
            Kessai pulls releases from GitHub and verifies their signatures before installing.
          </p>
        </div>
        {support === 'supported' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void checkForUpdates()}
            disabled={isBusy}
            aria-busy={status === 'checking'}
          >
            <RefreshCw className={status === 'checking' ? 'animate-spin' : ''} aria-hidden="true" />
            Check now
          </Button>
        ) : null}
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="type-label text-muted-foreground">Installed version</dt>
          <dd className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold">
            {currentVersion ?? bundledVersion}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="type-label text-muted-foreground">Release status</dt>
          <dd className="text-foreground text-sm" aria-live="polite">
            {statusLabels[status]}
            {latestVersion && latestVersion !== currentVersion ? (
              <span className="text-muted-foreground font-[family-name:var(--font-mono)]">
                {' '}
                · {latestVersion}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      {support === 'development' ? (
        <p className="text-muted-foreground text-xs">
          Updates are off in development builds (<code>pnpm tauri dev</code>). Install a release
          build to test them.
        </p>
      ) : null}

      {support === 'manual-linux-install' ? (
        <p className="text-muted-foreground text-xs">
          This Linux install needs one reinstall from the AppImage release before in-app updates can
          take over.
        </p>
      ) : null}

      {releaseNotes ? (
        <div className="border-border flex flex-col gap-2 rounded-lg border p-4">
          <p className="type-label text-muted-foreground">
            Release notes
            {releaseDate ? ` · ${new Date(releaseDate).toLocaleDateString()}` : ''}
          </p>
          <p className="text-foreground max-h-48 overflow-y-auto text-sm whitespace-pre-wrap">
            {releaseNotes}
          </p>
        </div>
      ) : null}

      {status === 'downloading' || status === 'installing' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {status === 'installing' ? 'Finishing install' : 'Download progress'}
            </span>
            <span className="text-foreground font-[family-name:var(--font-mono)] tabular-nums">
              {progress}%
            </span>
          </div>
          <ProgressBar
            value={progress}
            color="bg-primary"
            height="md"
            label={status === 'installing' ? 'Finishing install' : 'Download progress'}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {support === 'supported' ? (
        <Button
          onClick={() => void installUpdate()}
          disabled={!canInstall || isBusy}
          aria-busy={status === 'downloading' || status === 'installing'}
          className="self-start"
        >
          {status === 'downloading' || status === 'installing' ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Install update
        </Button>
      ) : null}
    </div>
  )
}
