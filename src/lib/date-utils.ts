import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import type { BillingCycle } from '@/types/subscription'

// Extend dayjs with plugins
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)

// Re-export BillingCycle from the canonical source
export type { BillingCycle }

/**
 * Calculates the next payment date based on billing cycle.
 * Returns the first future occurrence using the original anchor day (or the
 * explicit billing day), clamping each month independently without date drift.
 * @param startDate - The initial payment/start date
 * @param cycle - Billing cycle frequency
 * @param billingDay - Optional specific day for month-based cycles (1-31)
 * @returns The next payment date in the future
 * @example
 * calculateNextPaymentDate(new Date('2024-01-15'), 'monthly') // Next month's 15th
 * calculateNextPaymentDate(new Date('2024-01-15'), 'monthly', 1) // 1st of next month
 */
export function calculateNextPaymentDate(
  startDate: Date,
  cycle: BillingCycle,
  billingDay?: number
): Date {
  const today = dayjs().startOf('day')
  const anchor = dayjs(startDate).startOf('day')
  if (anchor.isAfter(today)) return anchor.toDate()

  if (cycle === 'weekly') {
    const periods = Math.floor(today.diff(anchor, 'day') / 7) + 1
    return anchor.add(periods * 7, 'day').toDate()
  }

  const monthsPerPeriod = cycle === 'yearly' ? 12 : cycle === 'quarterly' ? 3 : 1
  const anchorMonth = anchor.startOf('month')
  const monthsElapsed = today.startOf('month').diff(anchorMonth, 'month')
  let period = Math.max(1, Math.floor(monthsElapsed / monthsPerPeriod))
  const day = Math.max(1, Math.min(billingDay ?? anchor.date(), 31))
  let nextMonth = anchorMonth.add(period * monthsPerPeriod, 'month')
  let nextDate = nextMonth.date(Math.min(day, nextMonth.daysInMonth()))
  if (nextDate.isSameOrBefore(today)) {
    period++
    nextMonth = anchorMonth.add(period * monthsPerPeriod, 'month')
    nextDate = nextMonth.date(Math.min(day, nextMonth.daysInMonth()))
  }
  return nextDate.toDate()
}

/**
 * Formats a date as a full payment date string.
 * @param date - Date object or ISO string
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 * @example
 * formatPaymentDate('2024-01-15') // "Jan 15, 2024"
 */
export function formatPaymentDate(date: Date | string): string {
  return dayjs(date).format('MMM D, YYYY')
}

/**
 * Formats a date as a short date string (no year).
 * @param date - Date object or ISO string
 * @returns Formatted short date string (e.g., "Jan 15")
 * @example
 * formatShortDate('2024-01-15') // "Jan 15"
 */
export function formatShortDate(date: Date | string): string {
  return dayjs(date).format('MMM D')
}

/**
 * Calculates the number of days until a date.
 * @param date - Date object or ISO string
 * @returns Number of days until the date (negative if past)
 * @example
 * getDaysUntil('2024-01-20') // 5 (if today is Jan 15)
 */
export function getDaysUntil(date: Date | string): number {
  return dayjs(date).startOf('day').diff(dayjs().startOf('day'), 'day')
}

/**
 * Filters and sorts subscriptions by upcoming payment date.
 * @template T - Subscription type with next_payment_date
 * @param subscriptions - Array of subscriptions to filter
 * @param days - Number of days to look ahead
 * @returns Sorted array of subscriptions with payments within the window
 * @example
 * getUpcomingPayments(subscriptions, 7) // Payments in next 7 days
 */
export function getUpcomingPayments<T extends { next_payment_date: string | null }>(
  subscriptions: T[],
  days: number
): T[] {
  const now = dayjs().startOf('day')
  const cutoff = now.add(days, 'day').endOf('day')

  return subscriptions
    .filter((sub) => {
      if (!sub.next_payment_date) return false
      const date = dayjs(sub.next_payment_date)
      return date.isSameOrBefore(cutoff) && date.isSameOrAfter(now)
    })
    .sort((a, b) => {
      return dayjs(a.next_payment_date!).valueOf() - dayjs(b.next_payment_date!).valueOf()
    })
}
