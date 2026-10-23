import { useCallback, useEffect, useMemo } from 'react'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { usePaymentStore } from '@/stores/payment-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import type { CalendarOccurrence } from '@/types/payment'
import type { Subscription } from '@/types/subscription'

dayjs.extend(isSameOrBefore)

/**
 * Subscription metadata carried by a calendar occurrence. It comes from the calendar
 * query itself, so recorded payments of cancelled or deleted subscriptions still render.
 * `color` is taken from the loaded subscription when one exists.
 */
export type CalendarSubscription = Pick<
  Subscription,
  'id' | 'name' | 'currency' | 'billing_cycle' | 'category_id' | 'status' | 'is_active' | 'logo_url'
> & { color?: string | null }

/**
 * Payment data for a specific day.
 */
export interface DayPayment {
  /**
   * Unique within a month: the recorded payment ID, or `subscriptionId:dueDate` for the
   * single projected renewal. Duplicate ledger rows for one due date stay separate entries.
   */
  id?: string
  /** The subscription associated with this payment */
  subscription: CalendarSubscription
  /** Recorded full charge when a payment exists, otherwise the projected price */
  amount: number
  /** Whether the payment has been marked as paid */
  isPaid: boolean
  /** Whether the payment has been skipped */
  isSkipped: boolean
  /** Due date in yyyy-MM-dd format */
  dueDate: string
}

/**
 * Calendar day data with payment information.
 */
interface CalendarDay {
  /** JavaScript Date object */
  date: Date
  /** Day number (1-31) */
  dayOfMonth: number
  /** Whether this day is in the current displayed month */
  isCurrentMonth: boolean
  /** Whether this day is today */
  isToday: boolean
  /** Array of payments due on this day */
  payments: DayPayment[]
  /** Sum of all payment amounts for this day */
  totalAmount: number
}

/**
 * Monthly statistics for the calendar header. Amounts sum only occurrences in the display
 * currency when one is given (Kessai never converts currencies); counts cover every occurrence.
 */
interface MonthStats {
  /** Total expected spending for the month */
  totalAmount: number
  /** Amount already paid */
  paidAmount: number
  /** Amount still upcoming (not paid or skipped) */
  upcomingAmount: number
  /** Total number of payments this month */
  paymentCount: number
  /** Number of payments marked as paid */
  paidCount: number
  /** Number of payments marked as skipped */
  skippedCount: number
  /** Occurrences left out of the amounts because they bill in another currency, by code */
  excludedCurrencies: Record<string, number>
  /**
   * Percentage change compared to the previous month; null unless both months are loaded
   * without error and the previous month has occurrences with a non-zero total.
   */
  comparisonToPrevMonth: number | null
}

const NO_OCCURRENCES: CalendarOccurrence[] = []

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`

/** Full charge of an occurrence: a recorded payment amount wins over the projection. */
const occurrenceAmount = (occurrence: CalendarOccurrence) =>
  occurrence.payment?.amount ?? occurrence.projected_amount

function toDayPayment(occurrence: CalendarOccurrence, color: string | null): DayPayment {
  const { payment } = occurrence
  return {
    id: payment?.id ?? `${occurrence.subscription_id}:${occurrence.due_date}`,
    subscription: {
      id: occurrence.subscription_id,
      name: occurrence.name,
      currency: occurrence.currency,
      billing_cycle: occurrence.billing_cycle,
      category_id: occurrence.category_id,
      status: occurrence.status,
      is_active: occurrence.is_active,
      logo_url: occurrence.logo_url,
      color,
    },
    amount: occurrenceAmount(occurrence),
    isPaid: payment?.status === 'paid',
    isSkipped: payment?.status === 'skipped',
    dueDate: occurrence.due_date,
  }
}

/**
 * Helper function to generate an array of dates in a range.
 */
function eachDayOfInterval(start: dayjs.Dayjs, end: dayjs.Dayjs): dayjs.Dayjs[] {
  const days: dayjs.Dayjs[] = []
  let current = start
  while (current.isSameOrBefore(end, 'day')) {
    days.push(current)
    current = current.add(1, 'day')
  }
  return days
}

/**
 * Hook for the calendar grid and month statistics, built from the server's calendar
 * occurrences for the displayed month and the month before it (for the comparison).
 *
 * @param currentDate - The month to display (any date in the target month)
 * @param displayCurrency - When given, day and month amounts (and the comparison) sum only
 *   occurrences billed in this currency; the rest are counted in `excludedCurrencies`
 * @returns Calendar days, month stats, payment lookups, selected-month loading/error state,
 *   and `refetchPayments`, which rejects only when the displayed month fails to load
 * @example
 * const { calendarDays, monthStats, isLoading, error } = useCalendarStats(selectedMonth, 'USD')
 */
export function useCalendarStats(currentDate: Date, displayCurrency?: string) {
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1

  const fetchCalendarMonth = usePaymentStore((s) => s.fetchCalendarMonth)
  const watchCalendarMonth = usePaymentStore((s) => s.watchCalendarMonth)
  const selected = usePaymentStore((s) => s.calendarMonths[monthKey(year, month)])
  const previous = usePaymentStore((s) => s.calendarMonths[monthKey(prevYear, prevMonth)])
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)

  const refetchPayments = useCallback(async (): Promise<void> => {
    // The store records each month's error; a previous-month failure only hides the comparison.
    const [selectedResult] = await Promise.allSettled([
      fetchCalendarMonth(year, month),
      fetchCalendarMonth(prevYear, prevMonth),
    ])
    if (selectedResult.status === 'rejected') throw selectedResult.reason
  }, [fetchCalendarMonth, year, month, prevYear, prevMonth])

  // Only mounted months refresh after writes; invalidation evicts older navigation history.
  useEffect(() => {
    const stopWatchingSelected = watchCalendarMonth(year, month)
    const stopWatchingPrevious = watchCalendarMonth(prevYear, prevMonth)
    refetchPayments().catch(() => {
      // Surfaced through `error`, which reads the store's per-month state.
    })
    return () => {
      stopWatchingSelected()
      stopWatchingPrevious()
    }
  }, [refetchPayments, watchCalendarMonth, year, month, prevYear, prevMonth])

  const occurrences = selected?.occurrences ?? NO_OCCURRENCES

  const paymentsByDate = useMemo(() => {
    const colors = new Map(subscriptions.map((s) => [s.id, s.color]))
    const byDate = new Map<string, DayPayment[]>()
    for (const occurrence of occurrences) {
      const payment = toDayPayment(occurrence, colors.get(occurrence.subscription_id) ?? null)
      const day = byDate.get(occurrence.due_date)
      if (day) day.push(payment)
      else byDate.set(occurrence.due_date, [payment])
    }
    return byDate
  }, [occurrences, subscriptions])

  const getPaymentsForDay = useCallback(
    (dayOfMonth: number): DayPayment[] => {
      const dueDate = `${monthKey(year, month)}-${String(dayOfMonth).padStart(2, '0')}`
      return paymentsByDate.get(dueDate) ?? []
    },
    [paymentsByDate, year, month]
  )

  const calendarDays = useMemo((): CalendarDay[] => {
    const monthStart = dayjs(new Date(year, month - 1, 1))
    const today = dayjs()

    return eachDayOfInterval(monthStart, monthStart.endOf('month')).map((d) => {
      const dayPayments = paymentsByDate.get(d.format('YYYY-MM-DD')) ?? []

      return {
        date: d.toDate(),
        dayOfMonth: d.date(),
        isCurrentMonth: true,
        isToday: d.isSame(today, 'day'),
        payments: dayPayments,
        totalAmount: dayPayments.reduce(
          (sum, p) =>
            !displayCurrency || p.subscription.currency === displayCurrency ? sum + p.amount : sum,
          0
        ),
      }
    })
  }, [year, month, paymentsByDate, displayCurrency])

  const monthStats = useMemo((): MonthStats => {
    let totalAmount = 0
    let paidAmount = 0
    let upcomingAmount = 0
    let paidCount = 0
    let skippedCount = 0
    const excludedCurrencies: Record<string, number> = {}
    for (const occurrence of occurrences) {
      const status = occurrence.payment?.status
      if (status === 'paid') paidCount++
      else if (status === 'skipped') skippedCount++
      if (displayCurrency && occurrence.currency !== displayCurrency) {
        excludedCurrencies[occurrence.currency] = (excludedCurrencies[occurrence.currency] ?? 0) + 1
        continue
      }
      const amount = occurrenceAmount(occurrence)
      totalAmount += amount
      if (status === 'paid') {
        paidAmount += amount
      } else if (status !== 'skipped') {
        upcomingAmount += amount
      }
    }

    // Compare only two loaded, error-free months; an empty or zero-total previous month
    // has no baseline, so the comparison stays null.
    const prevMonthTotal =
      selected &&
      !selected.isLoading &&
      !selected.error &&
      previous &&
      !previous.isLoading &&
      !previous.error
        ? previous.occurrences.reduce(
            (sum, o) =>
              !displayCurrency || o.currency === displayCurrency ? sum + occurrenceAmount(o) : sum,
            0
          )
        : 0
    const comparisonToPrevMonth =
      prevMonthTotal !== 0 ? ((totalAmount - prevMonthTotal) / prevMonthTotal) * 100 : null

    return {
      totalAmount,
      paidAmount,
      upcomingAmount,
      paymentCount: occurrences.length,
      paidCount,
      skippedCount,
      excludedCurrencies,
      comparisonToPrevMonth,
    }
  }, [occurrences, selected, previous, displayCurrency])

  const getPaymentsForDate = useCallback(
    (date: Date): DayPayment[] => paymentsByDate.get(dayjs(date).format('YYYY-MM-DD')) ?? [],
    [paymentsByDate]
  )

  return {
    calendarDays,
    monthStats,
    getPaymentsForDate,
    getPaymentsForDay,
    refetchPayments,
    /** True until the displayed month has loaded, including background refreshes after writes */
    isLoading: selected === undefined || selected.isLoading,
    /** A background refresh keeps the last occurrences visible instead of an initial-load skeleton */
    isRefreshing: Boolean(selected?.isLoading && selected.occurrences.length > 0),
    /** Load error for the displayed month only */
    error: selected?.error ?? null,
  }
}
