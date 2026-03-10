import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter'
import isToday from 'dayjs/plugin/isToday'
import isTomorrow from 'dayjs/plugin/isTomorrow'
import weekOfYear from 'dayjs/plugin/weekOfYear'
import type { BillingCycle } from '@/types/subscription'

// Extend dayjs with plugins
dayjs.extend(isSameOrBefore)
dayjs.extend(isSameOrAfter)
dayjs.extend(isToday)
dayjs.extend(isTomorrow)
dayjs.extend(weekOfYear)

// Re-export BillingCycle from the canonical source
export type { BillingCycle }

/**
 * Calculates the next payment date based on billing cycle.
 * Advances from start date until finding a date in the future.
 * @param startDate - The initial payment/start date
 * @param cycle - Billing cycle frequency
 * @param billingDay - Optional specific day of month for monthly cycles (1-31)
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
  let nextDate = dayjs(startDate).startOf('day')

  while (nextDate.isSameOrBefore(today)) {
    switch (cycle) {
      case 'weekly':
        nextDate = nextDate.add(1, 'week')
        break
      case 'monthly':
        nextDate = nextDate.add(1, 'month')
        if (billingDay) {
          const daysInMonth = nextDate.daysInMonth()
          nextDate = nextDate.date(Math.min(billingDay, daysInMonth))
        }
        break
      case 'quarterly':
        nextDate = nextDate.add(3, 'month')
        break
      case 'yearly':
        nextDate = nextDate.add(1, 'year')
        break
      case 'custom':
        nextDate = nextDate.add(1, 'month')
        break
    }
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
 * Determines the urgency level of a date for UI styling.
 * @param date - Date object or ISO string
 * @returns Urgency level string for conditional styling
 * @example
 * getUrgencyLevel(new Date()) // 'today'
 * getUrgencyLevel(addDays(new Date(), 1)) // 'tomorrow'
 */
export function getUrgencyLevel(date: Date | string): 'today' | 'tomorrow' | 'this-week' | 'later' {
  const d = dayjs(date)
  const today = dayjs()

  if (d.isToday()) return 'today'
  if (d.isTomorrow()) return 'tomorrow'
  if (d.week() === today.week() && d.year() === today.year()) return 'this-week'
  return 'later'
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
  const cutoff = dayjs().add(days, 'day')
  const now = dayjs()

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
