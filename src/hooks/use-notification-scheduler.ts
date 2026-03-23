import { useEffect, useRef, useCallback } from 'react'
import dayjs from 'dayjs'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { formatCurrency } from '@/lib/currency'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Settings } from '@/types/settings'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const LAST_NOTIFIED_KEY = 'subby-last-notification-date'

/**
 * Gets the billing cycle label for notification messages.
 */
function cycleLabel(cycle: string): string {
  switch (cycle) {
    case 'weekly':
      return '/wk'
    case 'monthly':
      return '/mo'
    case 'quarterly':
      return '/qtr'
    case 'yearly':
      return '/yr'
    default:
      return '/mo'
  }
}

/**
 * Finds subscriptions with upcoming renewals within the advance window.
 */
function getUpcomingRenewals(subscriptions: Subscription[], advanceDays: number): Subscription[] {
  const today = dayjs().startOf('day')
  const cutoff = today.add(advanceDays, 'day').endOf('day')

  return subscriptions.filter((sub) => {
    if (!sub.is_active || !sub.next_payment_date) return false
    const paymentDate = dayjs(sub.next_payment_date).startOf('day')
    return paymentDate.isSameOrAfter(today) && paymentDate.isSameOrBefore(cutoff)
  })
}

/**
 * Groups subscriptions by their payment date for smart notification grouping.
 */
function groupByDate(subscriptions: Subscription[]): Map<string, Subscription[]> {
  const groups = new Map<string, Subscription[]>()
  for (const sub of subscriptions) {
    if (!sub.next_payment_date) continue
    const dateKey = dayjs(sub.next_payment_date).format('YYYY-MM-DD')
    const group = groups.get(dateKey) ?? []
    group.push(sub)
    groups.set(dateKey, group)
  }
  return groups
}

/**
 * Formats relative day label for notification messages.
 */
function relativeDayLabel(dateStr: string): string {
  const diff = dayjs(dateStr).startOf('day').diff(dayjs().startOf('day'), 'day')
  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff <= 7) return `in ${diff} days`
  return `on ${dayjs(dateStr).format('MMM D')}`
}

/**
 * Sends grouped or individual desktop notifications for upcoming renewals.
 */
async function sendRenewalNotifications(
  subscriptions: Subscription[],
  settings: Settings
): Promise<void> {
  const upcoming = getUpcomingRenewals(subscriptions, settings.notification_advance_days)
  if (upcoming.length === 0) return

  if (!isTauri()) return

  const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification')

  const granted = await isPermissionGranted()
  if (!granted) return

  const grouped = groupByDate(upcoming)

  for (const [dateKey, subs] of grouped) {
    const when = relativeDayLabel(dateKey)

    if (subs.length === 1) {
      // Individual notification
      const sub = subs[0]
      const amount = formatCurrency(sub.amount, sub.currency as CurrencyCode)
      const cycle = cycleLabel(sub.billing_cycle)

      sendNotification({
        title: `${sub.name} renews ${when}`,
        body: `${amount}${cycle}`,
      })
    } else if (subs.length === 2) {
      // Two subscriptions — list both
      const total = subs.reduce((sum, s) => sum + s.amount, 0)
      const currency = (subs[0].currency as CurrencyCode) ?? 'USD'
      const names = subs.map((s) => s.name).join(' and ')

      sendNotification({
        title: `${names} renew ${when}`,
        body: `Total: ${formatCurrency(total, currency)}`,
      })
    } else {
      // 3+ subscriptions — grouped notification
      const total = subs.reduce((sum, s) => sum + s.amount, 0)
      const currency = (subs[0].currency as CurrencyCode) ?? 'USD'

      sendNotification({
        title: `${subs.length} subscriptions renew ${when}`,
        body: `Total: ${formatCurrency(total, currency)} — ${subs.map((s) => s.name).join(', ')}`,
      })
    }
  }
}

/**
 * Checks if we should run notifications now based on the configured time
 * and whether we've already notified today.
 */
function shouldNotifyNow(settings: Settings): boolean {
  const now = dayjs()
  const [hours, minutes] = settings.notification_time.split(':').map(Number)
  const notifyTime = now.hour(hours).minute(minutes).second(0)

  // Only notify if we're past the configured time
  if (now.isBefore(notifyTime)) return false

  // Check if we've already notified today
  const lastNotified = localStorage.getItem(LAST_NOTIFIED_KEY)
  if (lastNotified === now.format('YYYY-MM-DD')) return false

  return true
}

/**
 * Hook that schedules and sends desktop notifications for upcoming subscription renewals.
 *
 * Runs a check on mount and every hour. Sends at most one batch of notifications per day,
 * respecting the user's configured notification time.
 *
 * Uses smart grouping: if 3+ subscriptions renew on the same day, sends one grouped
 * notification instead of individual ones.
 */
export function useNotificationScheduler(): void {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const checkAndNotify = useCallback(async () => {
    const settings = useSettingsStore.getState().settings
    const subscriptions = useSubscriptionStore.getState().subscriptions

    if (!settings || !settings.notification_enabled) return
    if (subscriptions.length === 0) return
    if (!shouldNotifyNow(settings)) return

    try {
      await sendRenewalNotifications(subscriptions, settings)
      localStorage.setItem(LAST_NOTIFIED_KEY, dayjs().format('YYYY-MM-DD'))
    } catch (error) {
      console.error('Failed to send renewal notifications:', error)
    }
  }, [])

  useEffect(() => {
    // Initial check after a short delay to let stores hydrate
    const startupTimeout = setTimeout(() => {
      checkAndNotify()
    }, 3000)

    // Periodic check every hour
    intervalRef.current = setInterval(checkAndNotify, CHECK_INTERVAL_MS)

    return () => {
      clearTimeout(startupTimeout)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [checkAndNotify])
}
