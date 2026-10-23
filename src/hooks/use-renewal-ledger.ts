import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { usePaymentStore } from '@/stores/payment-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import {
  buildRenewalLedger,
  calendarMonthKey,
  ledgerWindow,
  summarizeMonthRecords,
} from '@/lib/renewal-ledger'

/**
 * The dashboard's 30-day renewal ledger and this month's records, from the calendar month
 * projections in the payment store. Every month the window touches (today's and the next,
 * occasionally a third) is watched while the caller is mounted, so Mark paid and Skip
 * refresh them; a month evicted from the store is fetched again.
 *
 * @param today - Local date (YYYY-MM-DD) the window starts on
 * @returns `isLoading` only until each month first loads (refreshes keep the last rows),
 *   `error` for any month that failed, and `refetch`, which rejects if any month fails
 */
export function useRenewalLedger(today: string, displayCurrency: string) {
  const range = useMemo(() => ledgerWindow(today), [today])
  const keys = useMemo(() => range.months.map(calendarMonthKey), [range])
  const months = usePaymentStore(useShallow((s) => keys.map((key) => s.calendarMonths[key])))
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const fetchCalendarMonth = usePaymentStore((s) => s.fetchCalendarMonth)
  const watchCalendarMonth = usePaymentStore((s) => s.watchCalendarMonth)

  useEffect(() => {
    const stops = range.months.map(({ year, month }) => watchCalendarMonth(year, month))
    return () => stops.forEach((stop) => stop())
  }, [range, watchCalendarMonth])

  // Fetch every month when the window moves; afterwards only months that left the store.
  const fetchedWindow = useRef<string | null>(null)
  const missing = months.map((month) => (month ? 1 : 0)).join('')
  useEffect(() => {
    const windowKey = keys.join()
    const fetchAll = fetchedWindow.current !== windowKey
    fetchedWindow.current = windowKey
    const { calendarMonths } = usePaymentStore.getState()
    for (const ref of range.months) {
      if (fetchAll || !calendarMonths[calendarMonthKey(ref)]) {
        fetchCalendarMonth(ref.year, ref.month).catch(() => {
          // Surfaced through `error`, which reads the month's state in the store.
        })
      }
    }
  }, [range, keys, missing, fetchCalendarMonth])

  // A month counts as loaded once it has settled without error; later refreshes (after a
  // payment write) keep showing its last occurrences instead of a skeleton.
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set())
  useEffect(() => {
    const done = keys.filter((_, i) => months[i] && !months[i].isLoading && !months[i].error)
    if (done.some((key) => !settled.has(key))) {
      setSettled((previous) => new Set([...previous, ...done]))
    }
  }, [keys, months, settled])

  const occurrences = useMemo(() => months.flatMap((month) => month?.occurrences ?? []), [months])
  const ledger = useMemo(
    () => buildRenewalLedger(occurrences, { today, displayCurrency, subscriptions }),
    [occurrences, today, displayCurrency, subscriptions]
  )
  const currentMonth = months[0]
  const records = useMemo(
    () => summarizeMonthRecords(currentMonth?.occurrences ?? [], displayCurrency),
    [currentMonth, displayCurrency]
  )

  const refetch = useCallback(async (): Promise<void> => {
    const results = await Promise.allSettled(
      range.months.map(({ year, month }) => fetchCalendarMonth(year, month))
    )
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) throw failure.reason
  }, [range, fetchCalendarMonth])

  const error = months.find((month) => month?.error)?.error ?? null
  return {
    ledger,
    records,
    /** First load of any month in the window; never true again for a settled month. */
    isLoading: !error && keys.some((key) => !settled.has(key)),
    error,
    refetch,
  }
}
