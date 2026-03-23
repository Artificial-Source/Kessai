import { useEffect } from 'react'
import { useSubscriptionStore } from '@/stores/subscription-store'

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

/**
 * Keeps the system tray badge in sync with subscription data.
 * Calls the `update_tray_badge` Tauri command whenever subscriptions change.
 */
export function useTrayBadge() {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)

  useEffect(() => {
    if (!isTauri) return

    let cancelled = false

    import('@tauri-apps/api/core').then(({ invoke }) => {
      if (!cancelled) {
        invoke('update_tray_badge').catch(() => {
          // Tray update is best-effort; swallow errors silently
        })
      }
    })

    return () => {
      cancelled = true
    }
  }, [subscriptions])
}
