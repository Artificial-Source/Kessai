import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCalendarStats } from '../use-calendar-stats'
import { usePaymentStore } from '@/stores/payment-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import type * as ApiModule from '@/lib/api'
import type { CalendarOccurrence, Payment } from '@/types/payment'
import type { Subscription } from '@/types/subscription'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))

type MonthArgs = { year: number; month: number }

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

// ES2020 is the application's supported library target (no Promise.withResolvers).
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}

const keyOf = ({ year, month }: MonthArgs) => `${year}-${String(month).padStart(2, '0')}`

const occurrence = (overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence => ({
  subscription_id: 'netflix',
  due_date: '2024-02-15',
  name: 'Netflix',
  logo_url: null,
  category_id: 'cat-streaming',
  currency: 'USD',
  billing_cycle: 'monthly',
  status: 'active',
  is_active: true,
  projected_amount: 15,
  payment: null,
  ...overrides,
})

const recorded = (overrides: Partial<Payment> = {}): Payment => ({
  id: 'pay-1',
  subscription_id: 'netflix',
  amount: 15,
  paid_at: '2024-02-15T12:00:00Z',
  due_date: '2024-02-15',
  status: 'paid',
  notes: null,
  ...overrides,
})

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'netflix',
  name: 'Netflix',
  amount: 15,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 15,
  category_id: 'cat-streaming',
  color: '#e50914',
  logo_url: null,
  notes: null,
  is_active: true,
  next_payment_date: '2024-02-15',
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

/** Calendar API responses by `YYYY-MM`; an Error rejects that month. */
let months: Record<string, CalendarOccurrence[] | Error>

const calendarCalls = () =>
  invoke.mock.calls.filter(([command]) => command === 'list_calendar_payments').map(([, a]) => a)

const daysWithPayments = (days: { dayOfMonth: number; payments: unknown[] }[]) =>
  days.filter((day) => day.payments.length > 0).map((day) => day.dayOfMonth)

const february = new Date(2024, 1, 1) // February 2024 (leap year)

describe('useCalendarStats', () => {
  beforeEach(() => {
    invoke.mockReset()
    months = {}
    invoke.mockImplementation(async (command: string, args: MonthArgs) => {
      if (command !== 'list_calendar_payments') throw new Error(`Unexpected command: ${command}`)
      const response = months[keyOf(args)] ?? []
      if (response instanceof Error) throw response
      return response
    })
    usePaymentStore.setState({ payments: [], calendarMonths: {}, isLoading: false, error: null })
    useSubscriptionStore.setState({ subscriptions: [], isLoading: false, error: null })
  })

  it('loads the selected and previous month through the calendar API', async () => {
    const { result } = renderHook(() => useCalendarStats(february))

    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(false)
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(calendarCalls()).toEqual([
      { year: 2024, month: 2 },
      { year: 2024, month: 1 },
    ])
    expect(result.current.error).toBeNull()
    expect(result.current.calendarDays).toHaveLength(29)
    expect(result.current.calendarDays.map((day) => day.dayOfMonth)).toEqual(
      Array.from({ length: 29 }, (_, index) => index + 1)
    )
    expect(result.current.calendarDays.every((day) => day.isCurrentMonth)).toBe(true)
  })

  it('compares January against December of the previous year', async () => {
    const { result } = renderHook(() => useCalendarStats(new Date(2024, 0, 20)))

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(calendarCalls()).toEqual([
      { year: 2024, month: 1 },
      { year: 2023, month: 12 },
    ])
  })

  it.each([
    ['four', ['2024-02-07', '2024-02-14', '2024-02-21', '2024-02-28']],
    ['five', ['2024-02-01', '2024-02-08', '2024-02-15', '2024-02-22', '2024-02-29']],
  ])('shows all %s weekly charges the server returns', async (_, dueDates) => {
    months['2024-02'] = dueDates.map((due_date) =>
      occurrence({
        subscription_id: 'weekly',
        name: 'Weekly box',
        billing_cycle: 'weekly',
        projected_amount: 4.5,
        due_date,
      })
    )

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.monthStats.paymentCount).toBe(dueDates.length))
    expect(daysWithPayments(result.current.calendarDays)).toEqual(
      dueDates.map((date) => Number(date.slice(8)))
    )
    expect(result.current.monthStats.totalAmount).toBe(4.5 * dueDates.length)
    expect(result.current.monthStats.upcomingAmount).toBe(4.5 * dueDates.length)
  })

  it('does not fabricate quarterly charges outside the months the server returns', async () => {
    useSubscriptionStore.setState({
      subscriptions: [
        subscription({
          id: 'quarterly',
          name: 'Quarterly box',
          billing_cycle: 'quarterly',
          billing_day: 15,
          next_payment_date: '2024-04-15',
        }),
      ],
    })
    months['2024-01'] = [
      occurrence({
        subscription_id: 'quarterly',
        name: 'Quarterly box',
        billing_cycle: 'quarterly',
        due_date: '2024-01-15',
        projected_amount: 30,
      }),
    ]

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(daysWithPayments(result.current.calendarDays)).toEqual([])
    expect(result.current.getPaymentsForDay(15)).toEqual([])
    expect(result.current.monthStats.totalAmount).toBe(0)
    expect(result.current.monthStats.paymentCount).toBe(0)
  })

  it('keeps recorded payments of cancelled subscriptions visible without a live subscription', async () => {
    months['2024-02'] = [
      occurrence({
        subscription_id: 'gym',
        name: 'Old gym',
        logo_url: 'gym.png',
        category_id: null,
        billing_cycle: 'monthly',
        status: 'cancelled',
        is_active: false,
        due_date: '2024-02-10',
        projected_amount: 45,
        payment: recorded({
          id: 'pay-gym',
          subscription_id: 'gym',
          amount: 40,
          due_date: '2024-02-10',
        }),
      }),
    ]

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.getPaymentsForDay(10)).toHaveLength(1))
    expect(result.current.getPaymentsForDate(new Date(2024, 1, 10))).toEqual([
      {
        id: 'pay-gym',
        subscription: {
          id: 'gym',
          name: 'Old gym',
          currency: 'USD',
          billing_cycle: 'monthly',
          category_id: null,
          status: 'cancelled',
          is_active: false,
          logo_url: 'gym.png',
          color: null,
        },
        amount: 40,
        isPaid: true,
        isSkipped: false,
        dueDate: '2024-02-10',
      },
    ])
    expect(result.current.monthStats).toMatchObject({ paidAmount: 40, paidCount: 1 })
  })

  it('uses recorded amounts over projections and derives paid, skipped, and upcoming totals', async () => {
    useSubscriptionStore.setState({
      subscriptions: [subscription({ id: 'gym', color: '#336699' })],
    })
    months['2024-02'] = [
      occurrence({
        subscription_id: 'gym',
        name: 'Gym',
        due_date: '2024-02-10',
        projected_amount: 90,
        payment: recorded({ id: 'pay-gym', subscription_id: 'gym', amount: 30 }),
      }),
      occurrence({ due_date: '2024-02-20', projected_amount: 12 }),
      occurrence({
        subscription_id: 'news',
        name: 'News',
        due_date: '2024-02-25',
        projected_amount: 9,
        payment: recorded({
          id: 'pay-news',
          subscription_id: 'news',
          amount: 8,
          status: 'skipped',
        }),
      }),
    ]

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.monthStats.paymentCount).toBe(3))
    const [gym] = result.current.getPaymentsForDay(10)
    expect(gym).toMatchObject({ id: 'pay-gym', amount: 30, isPaid: true, isSkipped: false })
    expect(gym.subscription.color).toBe('#336699')
    expect(result.current.getPaymentsForDate(new Date(2024, 1, 20))).toEqual([
      expect.objectContaining({ id: 'netflix:2024-02-20', amount: 12, isPaid: false }),
    ])
    expect(result.current.getPaymentsForDay(25)).toEqual([
      expect.objectContaining({ amount: 8, isPaid: false, isSkipped: true }),
    ])
    expect(result.current.calendarDays[9].totalAmount).toBe(30)
    expect(result.current.monthStats).toEqual({
      totalAmount: 50,
      paidAmount: 30,
      upcomingAmount: 12,
      paymentCount: 3,
      paidCount: 1,
      skippedCount: 1,
      excludedCurrencies: {},
      comparisonToPrevMonth: null,
    })
  })

  it('sums only display-currency amounts and counts the other currencies it leaves out', async () => {
    months['2024-01'] = [
      occurrence({ due_date: '2024-01-15', projected_amount: 40 }),
      occurrence({ subscription_id: 'lessons', currency: 'JPY', projected_amount: 3200 }),
    ]
    months['2024-02'] = [
      occurrence({ projected_amount: 50 }),
      occurrence({
        subscription_id: 'lessons',
        name: 'Lessons',
        currency: 'JPY',
        projected_amount: 3200,
        payment: recorded({ id: 'pay-jpy', subscription_id: 'lessons', amount: 3200 }),
      }),
      occurrence({
        subscription_id: 'cloud',
        name: 'Cloud',
        currency: 'EUR',
        due_date: '2024-02-20',
        projected_amount: 9,
      }),
    ]

    const { result } = renderHook(() => useCalendarStats(february, 'USD'))

    await waitFor(() => expect(result.current.monthStats.comparisonToPrevMonth).toBe(25))
    expect(result.current.monthStats).toEqual({
      totalAmount: 50,
      paidAmount: 0,
      upcomingAmount: 50,
      paymentCount: 3,
      paidCount: 1,
      skippedCount: 0,
      excludedCurrencies: { JPY: 1, EUR: 1 },
      comparisonToPrevMonth: 25,
    })
    // Day totals follow the same rule; the payments themselves keep their own currency.
    expect(result.current.calendarDays[14].totalAmount).toBe(50)
    expect(result.current.calendarDays[14].payments).toHaveLength(2)
    expect(result.current.calendarDays[19].totalAmount).toBe(0)
  })

  it('keeps duplicate ledger rows for one due date as separately keyed entries', async () => {
    months['2024-02'] = [
      occurrence({ payment: recorded({ id: 'pay-a' }) }),
      occurrence({ payment: recorded({ id: 'pay-b' }) }),
    ]

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.getPaymentsForDay(15)).toHaveLength(2))
    expect(result.current.getPaymentsForDay(15).map((payment) => payment.id)).toEqual([
      'pay-a',
      'pay-b',
    ])
    expect(result.current.calendarDays[14].totalAmount).toBe(30)
  })

  it('compares against the previous month using the same canonical amounts', async () => {
    months['2024-01'] = [
      occurrence({ due_date: '2024-01-15', projected_amount: 10 }),
      occurrence({
        subscription_id: 'gym',
        due_date: '2024-01-10',
        projected_amount: 90,
        payment: recorded({ id: 'pay-gym', subscription_id: 'gym', amount: 30 }),
      }),
    ]
    months['2024-02'] = [occurrence({ projected_amount: 50 })]

    const { result } = renderHook(() => useCalendarStats(february))

    // Previous total is 10 + 30 recorded (not 90 projected) = 40; 50 is 25% higher.
    await waitFor(() => expect(result.current.monthStats.comparisonToPrevMonth).toBe(25))
  })

  it.each([
    ['has no records', []],
    ['totals zero', [occurrence({ due_date: '2024-01-15', projected_amount: 0 })]],
    ['failed to load', new Error('january offline')],
  ])('has no comparison when the previous month %s', async (_, previous) => {
    months['2024-01'] = previous
    months['2024-02'] = [occurrence({ projected_amount: 50 })]

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.monthStats.totalAmount).toBe(50))
    await waitFor(() =>
      expect(usePaymentStore.getState().calendarMonths['2024-01'].isLoading).toBe(false)
    )
    expect(result.current.monthStats.comparisonToPrevMonth).toBeNull()
    expect(result.current.error).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('has no comparison while the previous month is still loading', async () => {
    const january = deferred<CalendarOccurrence[]>()
    months['2024-02'] = [occurrence({ projected_amount: 50 })]
    invoke.mockImplementation(async (_command: string, args: MonthArgs) =>
      keyOf(args) === '2024-01' ? january.promise : months[keyOf(args)]
    )

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.monthStats.comparisonToPrevMonth).toBeNull()

    await act(async () => {
      january.resolve([occurrence({ due_date: '2024-01-15', projected_amount: 40 })])
      await january.promise
    })
    await waitFor(() => expect(result.current.monthStats.comparisonToPrevMonth).toBe(25))
  })

  it('reports a selected-month failure explicitly and rejects its refetch', async () => {
    months['2024-01'] = [occurrence({ due_date: '2024-01-15', projected_amount: 40 })]
    months['2024-02'] = new Error('calendar offline')

    const { result } = renderHook(() => useCalendarStats(february))

    await waitFor(() => expect(result.current.error).toBe('Error: calendar offline'))
    expect(result.current.isLoading).toBe(false)
    expect(result.current.monthStats.comparisonToPrevMonth).toBeNull()
    await act(async () => {
      await expect(result.current.refetchPayments()).rejects.toThrow('calendar offline')
    })
  })

  it('resolves a refetch when only the previous month fails', async () => {
    months['2024-01'] = new Error('january offline')
    months['2024-02'] = [occurrence()]

    const { result } = renderHook(() => useCalendarStats(february))
    await waitFor(() => expect(result.current.monthStats.paymentCount).toBe(1))

    await act(async () => {
      await expect(result.current.refetchPayments()).resolves.toBeUndefined()
    })
    expect(calendarCalls()).toHaveLength(4)
    expect(result.current.error).toBeNull()
  })

  it('keeps occurrences while automatically refreshing after a payment write', async () => {
    const refresh = deferred<CalendarOccurrence[]>()
    months['2024-02'] = [occurrence()]

    const { result } = renderHook(() => useCalendarStats(february))
    await waitFor(() => expect(result.current.monthStats.paymentCount).toBe(1))

    invoke.mockImplementation(async (command: string, args: MonthArgs) => {
      if (command === 'mark_payment_paid') return recorded()
      return args.month === 2 ? refresh.promise : []
    })
    await act(async () => {
      await usePaymentStore.getState().markAsPaid('netflix', '2024-02-15', 15)
    })
    expect(result.current.isLoading).toBe(true)
    expect(result.current.isRefreshing).toBe(true)
    expect(result.current.getPaymentsForDay(15)).toEqual([
      expect.objectContaining({ amount: 15, isPaid: false }),
    ])
    expect(calendarCalls()).toHaveLength(4)

    await act(async () => {
      refresh.resolve([occurrence({ payment: recorded() })])
      await refresh.promise
    })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isRefreshing).toBe(false)
    expect(result.current.getPaymentsForDay(15)).toEqual([
      expect.objectContaining({ id: 'pay-1', isPaid: true }),
    ])
  })

  it('refetches calendar occurrences after a subscription update', async () => {
    useSubscriptionStore.setState({ subscriptions: [subscription()] })
    months['2024-02'] = [occurrence()]
    const { result } = renderHook(() => useCalendarStats(february))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.getPaymentsForDay(15)[0].amount).toBe(15)

    invoke.mockImplementation(async (command: string, args: MonthArgs) => {
      if (command === 'update_subscription') {
        months['2024-02'] = [
          occurrence({ name: 'Netflix Premium', projected_amount: 20, due_date: '2024-02-20' }),
        ]
        return subscription({
          name: 'Netflix Premium',
          amount: 20,
          next_payment_date: '2024-02-20',
        })
      }
      return months[keyOf(args)] ?? []
    })
    await act(async () => {
      await useSubscriptionStore.getState().update('netflix', {
        name: 'Netflix Premium',
        amount: 20,
        next_payment_date: '2024-02-20',
      })
    })

    await waitFor(() => expect(calendarCalls()).toHaveLength(4))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.getPaymentsForDay(15)).toEqual([])
    expect(result.current.getPaymentsForDay(20)).toEqual([
      expect.objectContaining({
        amount: 20,
        subscription: expect.objectContaining({ name: 'Netflix Premium' }),
      }),
    ])
  })

  it('refreshes only the displayed and previous month after browsing four months and editing', async () => {
    useSubscriptionStore.setState({ subscriptions: [subscription()] })
    let amount = 15
    invoke.mockImplementation(async (command: string, args: MonthArgs) => {
      if (command === 'update_subscription') {
        amount = 20
        return subscription({ amount })
      }
      return [occurrence({ due_date: `${keyOf(args)}-15`, projected_amount: amount })]
    })
    const { result, rerender } = renderHook(({ date }) => useCalendarStats(date), {
      initialProps: { date: february },
    })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    for (const month of [2, 3, 4]) {
      rerender({ date: new Date(2024, month, 1) })
      await waitFor(() => expect(result.current.isLoading).toBe(false))
    }
    expect(Object.keys(usePaymentStore.getState().calendarMonths)).toHaveLength(5)
    invoke.mockClear()

    await act(async () => {
      await useSubscriptionStore.getState().update('netflix', { amount: 20 })
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(calendarCalls()).toEqual([
      { year: 2024, month: 5 },
      { year: 2024, month: 4 },
    ])
    expect(Object.keys(usePaymentStore.getState().calendarMonths).sort()).toEqual([
      '2024-04',
      '2024-05',
    ])
    expect(result.current.getPaymentsForDay(15)[0].amount).toBe(20)

    rerender({ date: february })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(calendarCalls().slice(2)).toEqual([
      { year: 2024, month: 2 },
      { year: 2024, month: 1 },
    ])
    expect(result.current.getPaymentsForDay(15)[0].amount).toBe(20)
  })

  it('evicts cached calendar months without refetching after the calendar unmounts', async () => {
    const { result, unmount } = renderHook(() => useCalendarStats(february))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    unmount()
    invoke.mockClear()

    usePaymentStore.getState().invalidateCalendar()

    expect(calendarCalls()).toEqual([])
    expect(usePaymentStore.getState().calendarMonths).toEqual({})
  })

  it('refetches an empty calendar month after adding a subscription', async () => {
    const { result } = renderHook(() => useCalendarStats(february))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.monthStats.paymentCount).toBe(0)

    invoke.mockImplementation(async (command: string, args: MonthArgs) => {
      if (command === 'create_subscription') {
        months['2024-02'] = [occurrence()]
        return subscription()
      }
      return months[keyOf(args)] ?? []
    })
    await act(async () => {
      await useSubscriptionStore.getState().add(subscription())
    })

    await waitFor(() => expect(calendarCalls()).toHaveLength(4))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.getPaymentsForDay(15)).toEqual([
      expect.objectContaining({
        amount: 15,
        subscription: expect.objectContaining({ name: 'Netflix' }),
      }),
    ])
  })

  it('keeps the selected month when navigation responses complete in reverse order', async () => {
    const requests: (Deferred<CalendarOccurrence[]> & { key: string })[] = []
    invoke.mockImplementation((_command: string, args: MonthArgs) => {
      const request = { key: keyOf(args), ...deferred<CalendarOccurrence[]>() }
      requests.push(request)
      return request.promise
    })
    const settle = async (index: number, occurrences: CalendarOccurrence[]) => {
      await act(async () => {
        requests[index].resolve(occurrences)
        await requests[index].promise
      })
    }

    const { result, rerender } = renderHook(({ date }) => useCalendarStats(date), {
      initialProps: { date: february },
    })
    rerender({ date: new Date(2024, 2, 1) })
    expect(requests.map((request) => request.key)).toEqual([
      '2024-02',
      '2024-01',
      '2024-03',
      '2024-02',
    ])

    await settle(3, [occurrence({ projected_amount: 10 })])
    expect(result.current.isLoading).toBe(true)
    expect(result.current.calendarDays).toHaveLength(31)
    expect(daysWithPayments(result.current.calendarDays)).toEqual([])

    await settle(2, [occurrence({ due_date: '2024-03-05', projected_amount: 20 })])
    await settle(1, [])
    await settle(0, [occurrence({ projected_amount: 999 })])

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(daysWithPayments(result.current.calendarDays)).toEqual([5])
    expect(result.current.monthStats.totalAmount).toBe(20)
    expect(result.current.monthStats.comparisonToPrevMonth).toBe(100)
    expect(usePaymentStore.getState().calendarMonths['2024-02'].occurrences).toEqual([
      occurrence({ projected_amount: 10 }),
    ])
  })
})
