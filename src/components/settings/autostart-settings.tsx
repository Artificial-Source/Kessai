import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { SettingRow } from '@/components/settings/settings-section'
import { getAutostartEnabled, mutateAutostartEnabled } from '@/lib/autostart'
import { isTauriRuntime } from '@/lib/runtime'

type AutostartPhase = 'loading' | 'ready' | 'toggling' | 'unknown'
type AutostartOutcome = 'none' | 'mismatch' | 'reconciled'

export function AutostartSettings() {
  if (!isTauriRuntime()) {
    return null
  }

  return <AutostartSettingsDesktop />
}

function AutostartSettingsDesktop() {
  const [phase, setPhase] = useState<AutostartPhase>('loading')
  const [enabled, setEnabled] = useState(false)
  const [outcome, setOutcome] = useState<AutostartOutcome>('none')
  const mountedRef = useRef(true)
  const toggleGenerationRef = useRef(0)

  useEffect(() => {
    mountedRef.current = true
    const generation = ++toggleGenerationRef.current
    getAutostartEnabled()
      .then((result) => {
        if (!mountedRef.current || generation !== toggleGenerationRef.current) return
        setEnabled(result)
        setPhase('ready')
      })
      .catch(() => {
        if (!mountedRef.current || generation !== toggleGenerationRef.current) return
        setPhase('unknown')
      })
    return () => {
      mountedRef.current = false
    }
  }, [])

  const toggling = phase === 'toggling'

  const handleToggle = async () => {
    if (toggling) return
    const targetEnabled = !enabled
    setPhase('toggling')
    setOutcome('none')
    const generation = ++toggleGenerationRef.current
    let mutationRejected = false
    try {
      await mutateAutostartEnabled(targetEnabled)
    } catch {
      // Mutation rejected — fall through to status reconciliation below.
      mutationRejected = true
    }
    if (!mountedRef.current || generation !== toggleGenerationRef.current) return
    // Reconcile actual OS state after every mutation outcome so a
    // verification failure surfaces as unknown rather than stale.
    try {
      const result = await getAutostartEnabled()
      if (!mountedRef.current || generation !== toggleGenerationRef.current) return
      setEnabled(result)
      setPhase('ready')
      if (result === targetEnabled) {
        // Desired state is live. A clean success is reflected by the toggle
        // itself; if the mutation rejected, truthfully report reconciled.
        setOutcome(mutationRejected ? 'reconciled' : 'none')
      } else {
        // The OS read returned a state different from the requested change.
        // Keep and display the exact reconciled toggle state, but surface a
        // visible alert that the requested change did not take effect.
        setOutcome('mismatch')
      }
    } catch {
      if (!mountedRef.current || generation !== toggleGenerationRef.current) return
      setPhase('unknown')
    }
  }

  // Retry only reads status — it never repeats enable/disable.
  const handleRetry = () => {
    const generation = ++toggleGenerationRef.current
    setPhase('loading')
    setOutcome('none')
    getAutostartEnabled()
      .then((result) => {
        if (!mountedRef.current || generation !== toggleGenerationRef.current) return
        setEnabled(result)
        setPhase('ready')
      })
      .catch(() => {
        if (!mountedRef.current || generation !== toggleGenerationRef.current) return
        setPhase('unknown')
      })
  }

  return (
    <div className="flex flex-col gap-3">
      {phase === 'loading' ? (
        <SettingRow label="Launch Kessai at login" description="Checking system setting…">
          <Skeleton className="h-6 w-11 rounded-full" />
        </SettingRow>
      ) : phase === 'unknown' ? (
        <SettingRow
          label="Launch Kessai at login"
          description="Could not confirm the login-start status. Retry to read the current system setting."
        >
          <div role="alert">
            <Button type="button" variant="outline" size="sm" onClick={handleRetry}>
              <RotateCw aria-hidden="true" />
              Retry
            </Button>
          </div>
        </SettingRow>
      ) : (
        <>
          <SettingRow
            label="Launch Kessai at login"
            htmlFor="autostart-enabled"
            description="Starts Kessai hidden in the tray at OS user login. If Private Web Access is enabled, it starts too. Explicit Quit stops both."
          >
            <Switch
              id="autostart-enabled"
              checked={enabled}
              onCheckedChange={() => void handleToggle()}
              disabled={toggling}
              aria-label="Launch Kessai at login"
            />
          </SettingRow>
          {toggling ? (
            <p
              role="status"
              aria-live="polite"
              className="text-muted-foreground flex items-center gap-1.5 text-xs"
            >
              <Loader2
                className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
              Applying…
            </p>
          ) : null}
          {phase === 'ready' && outcome === 'mismatch' ? (
            <p role="alert" className="text-destructive flex items-start gap-1.5 text-xs">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              The requested change did not take effect. The toggle shows the current system state.
            </p>
          ) : null}
          {phase === 'ready' && outcome === 'reconciled' ? (
            <p role="status" className="text-primary flex items-center gap-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Login start is now {enabled ? 'enabled' : 'disabled'}. The requested change took
              effect despite the error.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
