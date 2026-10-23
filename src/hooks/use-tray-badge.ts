import { useEffect, useRef } from 'react'
import { apiInvoke } from '@/lib/api'
import { logger } from '@/lib/logger'
import { isTauriRuntime } from '@/lib/runtime'
import { useSubscriptionStore } from '@/stores/subscription-store'

/**
 * Hook that refreshes the system tray badge count whenever
 * subscriptions change. Browser runtimes never invoke the desktop command.
 */
export function useTrayBadge() {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const hasWarned = useRef(false)

  useEffect(() => {
    if (!isTauriRuntime()) return

    apiInvoke('update_tray_badge').catch((error: unknown) => {
      if (hasWarned.current) return
      hasWarned.current = true
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('tray', `Failed to update tray badge: ${message}`)
    })
  }, [subscriptions])
}
