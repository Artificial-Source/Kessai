import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { usePaymentStore } from '../payment-store'
import type { CalendarOccurrence, Payment } from '@/types/payment'

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiInvoke: (...args: unknown[]) => mockInvoke(...args) }))

// ES2020 is the application's supported library target (no Promise.withResolvers).
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const occurrence: CalendarOccurrence = {
  subscription_id: 'sub',
  due_date: '2026-10-01',
  name: 'Service',
  logo_url: null,
  category_id: null,
  currency: 'USD',
  billing_cycle: 'monthly',
  status: 'active',
  is_active: true,
  projected_amount: 10,
  payment: null,
}
const payment: Payment = {
  id: 'pay',
  subscription_id: 'sub',
  amount: 10,
  status: 'paid',
  paid_at: '2026-10-01',
  due_date: '2026-10-01',
  notes: null,
}

const stopWatching: (() => void)[] = []
const watchMonth = (year: number, month: number) => {
  stopWatching.push(usePaymentStore.getState().watchCalendarMonth(year, month))
}

afterEach(() => {
  for (const stop of stopWatching.splice(0)) stop()
})

beforeEach(() => {
  mockInvoke.mockReset()
  usePaymentStore.setState({ payments: [], calendarMonths: {}, error: null, isLoading: false })
})

describe('fetchCalendarMonth', () => {
  it('keeps overlapping months under separate keys regardless of completion order', async () => {
    const october = deferred<CalendarOccurrence[]>()
    const november = deferred<CalendarOccurrence[]>()
    mockInvoke.mockReturnValueOnce(october.promise).mockReturnValueOnce(november.promise)
    const a = usePaymentStore.getState().fetchCalendarMonth(2026, 10)
    const b = usePaymentStore.getState().fetchCalendarMonth(2026, 11)
    const next = { ...occurrence, due_date: '2026-11-01' }
    november.resolve([next])
    await b
    october.resolve([occurrence])
    await a
    expect(usePaymentStore.getState().calendarMonths).toEqual({
      '2026-10': { occurrences: [occurrence], isLoading: false, error: null },
      '2026-11': { occurrences: [next], isLoading: false, error: null },
    })
    expect(mockInvoke).toHaveBeenCalledWith('list_calendar_payments', { year: 2026, month: 10 })
  })

  it('ignores an older response for the same month', async () => {
    const older = deferred<CalendarOccurrence[]>()
    const newer = deferred<CalendarOccurrence[]>()
    mockInvoke.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const a = usePaymentStore.getState().fetchCalendarMonth(2026, 10)
    const b = usePaymentStore.getState().fetchCalendarMonth(2026, 10)
    newer.resolve([{ ...occurrence, projected_amount: 20 }])
    await b
    older.resolve([occurrence])
    await a
    expect(
      usePaymentStore.getState().calendarMonths['2026-10'].occurrences[0].projected_amount
    ).toBe(20)
  })

  it('rejects query failures and records them against the requested month', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('calendar offline'))
    await expect(usePaymentStore.getState().fetchCalendarMonth(2026, 10)).rejects.toThrow(
      'calendar offline'
    )
    expect(usePaymentStore.getState().calendarMonths['2026-10']).toEqual({
      occurrences: [],
      isLoading: false,
      error: 'Error: calendar offline',
    })
    expect(usePaymentStore.getState().error).toBe('Error: calendar offline')
  })

  it('refetches rather than publishing a month response that predates a payment write', async () => {
    watchMonth(2026, 10)
    const read = deferred<CalendarOccurrence[]>()
    const updated = { ...occurrence, payment }
    mockInvoke
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce(payment)
      .mockResolvedValueOnce([updated])
    const fetching = usePaymentStore.getState().fetchCalendarMonth(2026, 10)
    await usePaymentStore.getState().markAsPaid('sub', '2026-10-01', 10)
    read.resolve([occurrence])
    await fetching
    await waitFor(() =>
      expect(usePaymentStore.getState().calendarMonths['2026-10']).toEqual({
        occurrences: [updated],
        isLoading: false,
        error: null,
      })
    )
  })

  it.each(['resolves', 'rejects'] as const)(
    'refetches a month opened during a write when its stale read %s, never marking the placeholder loaded',
    async (outcome) => {
      watchMonth(2026, 11)
      const write = deferred<Payment>()
      const duringWrite = deferred<CalendarOccurrence[]>()
      const afterWrite = deferred<CalendarOccurrence[]>()
      const november = { ...occurrence, due_date: '2026-11-01' }
      mockInvoke
        .mockReturnValueOnce(write.promise)
        .mockReturnValueOnce(duringWrite.promise)
        .mockReturnValueOnce(afterWrite.promise)
      const loadedEmpty: boolean[] = []
      const unsubscribe = usePaymentStore.subscribe(({ calendarMonths }) => {
        const month = calendarMonths['2026-11']
        if (month) {
          loadedEmpty.push(!month.isLoading && !month.error && month.occurrences.length === 0)
        }
      })

      try {
        const marking = usePaymentStore.getState().markAsPaid('sub', '2026-10-01', 10)
        const fetching = usePaymentStore
          .getState()
          .fetchCalendarMonth(2026, 11)
          .catch(() => undefined)
        if (outcome === 'resolves') duringWrite.resolve([])
        else duringWrite.reject(new Error('stale read failed'))
        await fetching
        expect(usePaymentStore.getState().calendarMonths['2026-11'].isLoading).toBe(true)

        write.resolve(payment)
        await marking
        expect(mockInvoke).toHaveBeenLastCalledWith('list_calendar_payments', {
          year: 2026,
          month: 11,
        })
        expect(usePaymentStore.getState().calendarMonths['2026-11'].isLoading).toBe(true)
        afterWrite.resolve([november])
        await waitFor(() =>
          expect(usePaymentStore.getState().calendarMonths['2026-11']).toEqual({
            occurrences: [november],
            isLoading: false,
            error: null,
          })
        )
        expect(loadedEmpty).not.toContain(true)
      } finally {
        unsubscribe()
      }
    }
  )

  it('waits for all overlapping writes before refreshing watched occurrences', async () => {
    watchMonth(2026, 10)
    mockInvoke.mockResolvedValueOnce([occurrence])
    await usePaymentStore.getState().fetchCalendarMonth(2026, 10)
    const paid = deferred<Payment>()
    const skipped = deferred<Payment>()
    const refresh = deferred<CalendarOccurrence[]>()
    mockInvoke
      .mockReturnValueOnce(paid.promise)
      .mockReturnValueOnce(skipped.promise)
      .mockReturnValueOnce(refresh.promise)

    const marking = usePaymentStore.getState().markAsPaid('sub', '2026-10-01', 10)
    const skipping = usePaymentStore.getState().skipPayment('sub', '2026-10-01', 10)
    paid.resolve(payment)
    await marking
    expect(mockInvoke).toHaveBeenCalledTimes(3)
    expect(usePaymentStore.getState().calendarMonths['2026-10']).toEqual({
      occurrences: [occurrence],
      isLoading: true,
      error: null,
    })

    const skippedPayment = { ...payment, status: 'skipped' as const }
    skipped.resolve(skippedPayment)
    await skipping
    expect(mockInvoke).toHaveBeenLastCalledWith('list_calendar_payments', {
      year: 2026,
      month: 10,
    })
    refresh.resolve([{ ...occurrence, payment: skippedPayment }])
    await waitFor(() =>
      expect(usePaymentStore.getState().calendarMonths['2026-10']).toEqual({
        occurrences: [{ ...occurrence, payment: skippedPayment }],
        isLoading: false,
        error: null,
      })
    )
  })

  it.each([
    [1899, 10, 'year must be from 1900 to 9998'],
    [1899, 13, 'year must be from 1900 to 9998'],
    [2026, 13, 'month must be from 1 to 12'],
  ])('surfaces invalid calendar input %s/%s from the backend', async (year, month, message) => {
    mockInvoke.mockRejectedValueOnce(new Error(message))
    await expect(usePaymentStore.getState().fetchCalendarMonth(year, month)).rejects.toThrow(
      message
    )
    expect(usePaymentStore.getState().calendarMonths[`${year}-${month}`]).toMatchObject({
      isLoading: false,
      error: `Error: ${message}`,
    })
  })

  it.each(['paid', 'skipped', 'deleted'] as const)(
    'keeps watched months visible while refetching after %s',
    async (action) => {
      watchMonth(2026, 10)
      watchMonth(2026, 11)
      const november = { ...occurrence, due_date: '2026-11-01' }
      mockInvoke.mockResolvedValueOnce([occurrence]).mockResolvedValueOnce([november])
      await usePaymentStore.getState().fetchCalendarMonth(2026, 10)
      await usePaymentStore.getState().fetchCalendarMonth(2026, 11)
      const write = deferred<Payment | void>()
      const octoberRefresh = deferred<CalendarOccurrence[]>()
      const novemberRefresh = deferred<CalendarOccurrence[]>()
      mockInvoke
        .mockReturnValueOnce(write.promise)
        .mockReturnValueOnce(octoberRefresh.promise)
        .mockReturnValueOnce(novemberRefresh.promise)
      const writing =
        action === 'paid'
          ? usePaymentStore.getState().markAsPaid('sub', '2026-10-01', 10)
          : action === 'skipped'
            ? usePaymentStore.getState().skipPayment('sub', '2026-10-01', 10)
            : usePaymentStore.getState().deletePayment('pay')
      expect(usePaymentStore.getState().calendarMonths).toEqual({
        '2026-10': { occurrences: [occurrence], isLoading: true, error: null },
        '2026-11': { occurrences: [november], isLoading: true, error: null },
      })

      write.resolve(action === 'deleted' ? undefined : payment)
      await writing
      expect(usePaymentStore.getState().calendarMonths['2026-10'].occurrences).toEqual([occurrence])
      octoberRefresh.resolve([{ ...occurrence, payment: action === 'deleted' ? null : payment }])
      novemberRefresh.resolve([november])
      await waitFor(() =>
        expect(usePaymentStore.getState().calendarMonths['2026-11'].isLoading).toBe(false)
      )
      expect(usePaymentStore.getState().calendarMonths['2026-10']).toEqual({
        occurrences: [{ ...occurrence, payment: action === 'deleted' ? null : payment }],
        isLoading: false,
        error: null,
      })
    }
  )
})

it('does not let an older occurrence write replace a later successful payment action', async () => {
  const older = deferred<{
    id: string
    subscription_id: string
    amount: number
    status: 'paid' | 'skipped'
    paid_at: string
    due_date: string
  }>()
  const paid = {
    id: 'pay',
    subscription_id: 'sub',
    amount: 10,
    status: 'paid' as const,
    paid_at: '2026-10-01',
    due_date: '2026-10-01',
  }
  mockInvoke
    .mockReturnValueOnce(older.promise)
    .mockResolvedValueOnce({ ...paid, status: 'skipped' })
  const marking = usePaymentStore.getState().markAsPaid('sub', '2026-10-01', 10)
  await usePaymentStore.getState().skipPayment('sub', '2026-10-01', 10)
  older.resolve(paid)
  await marking
  expect(usePaymentStore.getState().payments).toEqual([{ ...paid, status: 'skipped' }])
})
