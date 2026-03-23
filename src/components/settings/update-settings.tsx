import { useEffect } from 'react'
import { Download, RefreshCw, MonitorDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar'
import { useUpdateStore } from '@/stores/update-store'

const statusLabels: Record<string, string> = {
  idle: 'Ready to check for updates',
  checking: 'Checking GitHub releases',
  available: 'Update available',
  'up-to-date': 'You are on the latest release',
  downloading: 'Downloading update',
  installing: 'Installing update',
  error: 'Update check failed',
  unsupported: 'Updater unavailable here',
}

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
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <MonitorDown className="text-primary h-5 w-5" />
            <h2 className="text-foreground text-lg font-bold">Updates</h2>
          </div>
          <p className="text-muted-foreground text-sm">
            Install Subby once, then pull future releases from GitHub automatically.
          </p>
        </div>

        {support === 'supported' ? (
          <Button variant="outline" onClick={() => void checkForUpdates()} disabled={isBusy}>
            <RefreshCw className={status === 'checking' ? 'animate-spin' : ''} />
            Check now
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border-border/60 bg-background/40 rounded-xl border p-4">
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Installed Version
          </p>
          <p className="text-foreground mt-2 font-[family-name:var(--font-mono)] text-base font-bold">
            {currentVersion ?? 'Loading...'}
          </p>
        </div>

        <div className="border-border/60 bg-background/40 rounded-xl border p-4">
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Release Status
          </p>
          <p className="text-foreground mt-2 font-[family-name:var(--font-sans)] text-sm font-medium">
            {statusLabels[status]}
          </p>
          {latestVersion ? (
            <p className="text-muted-foreground mt-1 font-[family-name:var(--font-mono)] text-xs">
              Latest: {latestVersion}
            </p>
          ) : null}
        </div>
      </div>

      {support === 'browser' ? (
        <p className="text-muted-foreground text-sm">
          The updater only runs in the installed Tauri desktop app, not in a browser test harness.
        </p>
      ) : null}

      {support === 'development' ? (
        <p className="text-muted-foreground text-sm">
          Updater checks are disabled in `pnpm tauri dev`. Build and install a release package to
          test the full flow.
        </p>
      ) : null}

      {releaseDate ? (
        <p className="text-muted-foreground text-xs">
          Release published {new Date(releaseDate).toLocaleString()}
        </p>
      ) : null}

      {releaseNotes ? (
        <div className="border-border/60 bg-background/30 rounded-xl border p-4">
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Release Notes
          </p>
          <p className="text-foreground mt-2 text-sm whitespace-pre-wrap">{releaseNotes}</p>
        </div>
      ) : null}

      {status === 'downloading' || status === 'installing' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {status === 'installing' ? 'Finishing install' : 'Download progress'}
            </span>
            <span className="text-foreground font-[family-name:var(--font-mono)]">{progress}%</span>
          </div>
          <ProgressBar value={progress} color="bg-primary" height="md" />
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      {support === 'supported' ? (
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void installUpdate()} disabled={!canInstall || isBusy}>
            <Download />
            Install update
          </Button>
          <p className="text-muted-foreground self-center text-xs">
            Releases are fetched from GitHub and verified with Tauri signatures before install.
          </p>
        </div>
      ) : null}
    </div>
  )
}
