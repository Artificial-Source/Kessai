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
const SENT_NOTIFICATIONS_KEY = 'subby-sent-notifications'
const CLEANUP_THRESHOLD_DAYS = 60

interface SentNotificationRecord {
  subId: string
  date: string
  daysBefore: number
}

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
 * Reads sent notification records from localStorage.
 */
function getSentNotifications(): SentNotificationRecord[] {
  try {
    const raw = localStorage.getItem(SENT_NOTIFICATIONS_KEY)
    if (!raw) return []
    return JSON.parse(raw) as SentNotificationRecord[]
  } catch {
    return []
  }
}

/**
 * Saves sent notification records to localStorage.
 */
function saveSentNotifications(records: SentNotificationRecord[]): void {
  localStorage.setItem(SENT_NOTIFICATIONS_KEY, JSON.stringify(records))
}

/**
 * Checks whether a notification has already been sent for a given subscription, date, and advance days.
 */
function wasAlreadySent(
  records: SentNotificationRecord[],
  subId: string,
  date: string,
  daysBefore: number
): boolean {
  return records.some((r) => r.subId === subId && r.date === date && r.daysBefore === daysBefore)
}

/**
 * Cleans up sent notification records older than CLEANUP_THRESHOLD_DAYS.
 */
function cleanupOldRecords(records: SentNotificationRecord[]): SentNotificationRecord[] {
  const cutoff = dayjs().subtract(CLEANUP_THRESHOLD_DAYS, 'day').format('YYYY-MM-DD')
  return records.filter((r) => r.date >= cutoff)
}

/**
 * Finds subscriptions with upcoming renewals within the given advance window.
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
 * Sends grouped or individual desktop notifications for upcoming renewals,
 * iterating over multiple notification_days_before values and deduplicating via localStorage.
 */
async function sendRenewalNotifications(
  subscriptions: Subscription[],
  settings: Settings
): Promise<void> {
  if (!isTauri()) return

  const { isPermissionGranted, sendNotification } = await import(
    '@tauri-apps/plugin-notification'
  )

  const granted = await isPermissionGranted()
  if (!granted) return

  const daysBefore = settings.notification_days_before ?? [settings.notification_advance_days]
  const maxAdvance = Math.max(...daysBefore)

  // Get all upcoming renewals within the maximum advance window
  const upcoming = getUpcomingRenewals(subscriptions, maxAdvance)
  if (upcoming.length === 0) return

  // Load sent records and clean up old entries
  let sentRecords = getSentNotifications()
  sentRecords = cleanupOldRecords(sentRecords)

  const today = dayjs().startOf('day')
  const newlySent: SentNotificationRecord[] = []

  // For each advance-day value, find subscriptions that should be notified
  for (const advDays of daysBefore) {
    const subsForThisWindow: Subscription[] = []

    for (const sub of upcoming) {
      if (!sub.next_payment_date) continue
      const paymentDate = dayjs(sub.next_payment_date).startOf('day')
      const daysUntilPayment = paymentDate.diff(today, 'day')

      // This subscription qualifies for notification at this advance window
      if (daysUntilPayment <= advDays) {
        const dateKey = paymentDate.format('YYYY-MM-DD')
        if (!wasAlreadySent(sentRecords, sub.id, dateKey, advDays)) {
          subsForThisWindow.push(sub)
          newlySent.push({ subId: sub.id, date: dateKey, daysBefore: advDays })
        }
      }
    }

    if (subsForThisWindow.length === 0) continue

    // Group by payment date and send notifications
    const grouped = groupByDate(subsForThisWindow)

    for (const [dateKey, subs] of grouped) {
      const when = relativeDayLabel(dateKey)

      if (subs.length === 1) {
        const sub = subs[0]
        const amount = formatCurrency(sub.amount, sub.currency as CurrencyCode)
        const cycle = cycleLabel(sub.billing_cycle)

        sendNotification({
          title: `${sub.name} renews ${when}`,
          body: `${amount}${cycle}`,
        })
      } else if (subs.length === 2) {
        const total = subs.reduce((sum, s) => sum + s.amount, 0)
        const currency = (subs[0].currency as CurrencyCode) ?? 'USD'
        const names = subs.map((s) => s.name).join(' and ')

        sendNotification({
          title: `${names} renew ${when}`,
          body: `Total: ${formatCurrency(total, currency)}`,
        })
      } else {
        const total = subs.reduce((sum, s) => sum + s.amount, 0)
        const currency = (subs[0].currency as CurrencyCode) ?? 'USD'

        sendNotification({
          title: `${subs.length} subscriptions renew ${when}`,
          body: `Total: ${formatCurrency(total, currency)} — ${subs.map((s) => s.name).join(', ')}`,
        })
      }
    }
  }

  // Persist newly sent records
  if (newlySent.length > 0) {
    saveSentNotifications([...sentRecords, ...newlySent])
  } else {
    // Still save cleaned-up records
    saveSentNotifications(sentRecords)
  }
}

/**
 * Checks if we should run notifications now based on the configured time.
 */
function shouldNotifyNow(settings: Settings): boolean {
  const now = dayjs()
  const [hours, minutes] = settings.notification_time.split(':').map(Number)
  const notifyTime = now.hour(hours).minute(minutes).second(0)

  // Only notify if we're past the configured time
  if (now.isBefore(notifyTime)) return false

  return true
}

/**
 * Hook that schedules and sends desktop notifications for upcoming subscription renewals.
 *
 * Runs a check on mount and every hour. Supports multiple advance-day values and
 * deduplicates notifications via localStorage to avoid sending the same reminder twice.
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
