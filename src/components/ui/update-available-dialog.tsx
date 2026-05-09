import { useState } from 'react'
import { Download, Sparkles } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUpdateStore } from '@/stores/update-store'

const DISMISSED_UPDATE_KEY = 'kessai-dismissed-update-version'

export function UpdateAvailableDialog() {
  const { status, latestVersion, releaseNotes, releaseDate, progress, installUpdate } =
    useUpdateStore()
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(() => {
    try {
      return localStorage.getItem(DISMISSED_UPDATE_KEY)
    } catch {
      return null
    }
  })

  const isBusy = status === 'downloading' || status === 'installing'
  const hasUpdate = status === 'available' || status === 'downloading' || status === 'installing'
  const isOpen = hasUpdate && latestVersion !== null && dismissedVersion !== latestVersion

  const dismiss = () => {
    if (!latestVersion) return

    try {
      localStorage.setItem(DISMISSED_UPDATE_KEY, latestVersion)
    } catch {
      // Ignore storage failures; closing for this session is still useful.
    }

    setDismissedVersion(latestVersion)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && dismiss()}>
      <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-lg">
        <DialogHeader>
          <div className="bg-primary/10 text-primary mb-1 flex h-10 w-10 items-center justify-center rounded-xl">
            <Sparkles className="h-5 w-5" />
          </div>
          <DialogTitle className="font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight">
            Kessai {latestVersion} is ready
          </DialogTitle>
          <DialogDescription>
            Review what changed, then install when you are ready to restart.
          </DialogDescription>
        </DialogHeader>

        {releaseDate ? (
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            Published {new Date(releaseDate).toLocaleString()}
          </p>
        ) : null}

        <section className="border-border/60 bg-background/40 max-h-[38vh] min-h-0 overflow-y-auto rounded-xl border p-4">
          <p className="text-muted-foreground mb-3 font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
            What changed
          </p>
          <p className="text-foreground text-sm whitespace-pre-wrap">
            {releaseNotes?.trim() || 'This release includes the latest fixes and improvements.'}
          </p>
        </section>

        {isBusy ? (
          <p className="text-muted-foreground text-sm">
            {status === 'installing'
              ? 'Finishing install...'
              : `Downloading update... ${progress}%`}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={dismiss} disabled={isBusy}>
            Later
          </Button>
          <Button onClick={() => void installUpdate()} disabled={isBusy}>
            <Download />
            Install update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
