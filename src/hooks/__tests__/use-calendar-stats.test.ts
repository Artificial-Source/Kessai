import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useCalendarStats } from '../use-calendar-stats'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePaymentStore } from '@/stores/payment-store'

// Mock data
const mockSubscriptions = [
  {
    id: 'sub-1',
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: 15,
    category_id: 'cat-streaming',
    color: '#e50914',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    next_payment_date: '2024-02-15',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sub-2',
    name: 'Spotify',
    amount: 9.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: 20,
    category_id: 'cat-music',
    color: '#1db954',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    next_payment_date: '2024-02-20',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sub-3',
    name: 'Adobe CC',
    amount: 54.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: 25,
    category_id: 'cat-software',
    color: '#ff0000',
    logo_url: null,
    notes: null,
    is_active: false, // Inactive
    status: 'cancelled' as const,
    shared_count: 1,
    next_payment_date: '2024-02-25',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
]

const mockCategories = [
  {
    id: 'cat-streaming',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'play-circle',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-music',
    name: 'Music',
    color: '#f59e0b',
    icon: 'music',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

describe('useCalendarStats', () => {
  const currentDate = new Date(2024, 1, 1) // February 2024

  beforeEach(() => {
    // Reset subscription store
    useSubscriptionStore.setState({
      subscriptions: mockSubscriptions,
      isLoading: false,
      error: null,
    })

    // Reset category store
    useCategoryStore.setState({
      categories: mockCategories,
      isLoading: false,
      error: null,
    })

    // Reset payment store with mock function
    usePaymentStore.setState({
      payments: [],
      isLoading: false,
      error: null,
      fetchPaymentsByMonth: vi.fn().mockResolvedValue([]),
    })
  })

  it('returns calendar days for the month', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      // February 2024 has 29 days (leap year)
      expect(result.current.calendarDays).toHaveLength(29)
    })
  })

  it('each calendar day has correct structure', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    result.current.calendarDays.forEach((day) => {
      expect(day).toHaveProperty('date')
      expect(day).toHaveProperty('dayOfMonth')
      expect(day).toHaveProperty('isCurrentMonth')
      expect(day).toHaveProperty('isToday')
      expect(day).toHaveProperty('payments')
      expect(day).toHaveProperty('totalAmount')
      expect(typeof day.dayOfMonth).toBe('number')
      expect(Array.isArray(day.payments)).toBe(true)
    })
  })

  it('calculates month stats', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.monthStats).toBeDefined()
    })

    const { monthStats } = result.current

    expect(monthStats).toHaveProperty('totalAmount')
    expect(monthStats).toHaveProperty('paidAmount')
    expect(monthStats).toHaveProperty('upcomingAmount')
    expect(monthStats).toHaveProperty('paymentCount')
    expect(monthStats).toHaveProperty('paidCount')
    expect(monthStats).toHaveProperty('comparisonToPrevMonth')
  })

  it('excludes inactive subscriptions from payments', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    // Adobe CC is inactive, so it shouldn't appear
    const allPayments = result.current.calendarDays.flatMap((d) => d.payments)
    const adobePayment = allPayments.find((p) => p.subscription.name === 'Adobe CC')

    expect(adobePayment).toBeUndefined()
  })

  it('assigns payments to correct days based on billing_day', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    // Netflix has billing_day 15
    const day15 = result.current.calendarDays.find((d) => d.dayOfMonth === 15)
    const netflixPayment = day15?.payments.find((p) => p.subscription.name === 'Netflix')
    expect(netflixPayment).toBeDefined()
    expect(netflixPayment?.amount).toBe(15.99)

    // Spotify has billing_day 20
    const day20 = result.current.calendarDays.find((d) => d.dayOfMonth === 20)
    const spotifyPayment = day20?.payments.find((p) => p.subscription.name === 'Spotify')
    expect(spotifyPayment).toBeDefined()
    expect(spotifyPayment?.amount).toBe(9.99)
  })

  it('getPaymentsForDate returns correct payments', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    const payments = result.current.getPaymentsForDate(new Date(2024, 1, 15))
    const netflixPayment = payments.find((p) => p.subscription.name === 'Netflix')

    expect(netflixPayment).toBeDefined()
  })

  it('returns empty payments for days without subscriptions', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    // Day 1 should have no payments
    const day1 = result.current.calendarDays.find((d) => d.dayOfMonth === 1)
    expect(day1?.payments).toHaveLength(0)
    expect(day1?.totalAmount).toBe(0)
  })

  it('handles month with no active subscriptions', async () => {
    // Set all subscriptions to inactive
    useSubscriptionStore.setState({
      subscriptions: mockSubscriptions.map((s) => ({
        ...s,
        is_active: false,
        status: 'cancelled' as const,
      })),
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.monthStats).toBeDefined()
    })

    expect(result.current.monthStats.totalAmount).toBe(0)
    expect(result.current.monthStats.paymentCount).toBe(0)
  })

  it('calls fetchPaymentsByMonth on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValue([])
    usePaymentStore.setState({
      payments: [],
      isLoading: false,
      error: null,
      fetchPaymentsByMonth: mockFetch,
    })

    renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(2024, 2) // February 2024
    })
  })

  it('handles weekly billing cycle subscriptions', async () => {
    // Add a weekly subscription that has a next_payment_date on a Wednesday
    const weeklySub = {
      id: 'sub-weekly',
      name: 'Weekly Service',
      amount: 4.99,
      currency: 'USD',
      billing_cycle: 'weekly' as const,
      billing_day: 1,
      category_id: null,
      color: '#00ff00',
      logo_url: null,
      notes: null,
      is_active: true,
      status: 'active' as const,
      shared_count: 1,
      // Feb 7, 2024 is a Wednesday
      next_payment_date: '2024-02-07',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }

    useSubscriptionStore.setState({
      subscriptions: [weeklySub],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    // Weekly payments should appear on all Wednesdays in February 2024
    // Feb 7, 14, 21, 28 are Wednesdays
    const daysWithPayments = result.current.calendarDays.filter((d) => d.payments.length > 0)
    expect(daysWithPayments.length).toBeGreaterThanOrEqual(1)
  })

  it('handles yearly billing cycle with next_payment_date in current month', async () => {
    const yearlySub = {
      id: 'sub-yearly',
      name: 'Yearly Service',
      amount: 99.99,
      currency: 'USD',
      billing_cycle: 'yearly' as const,
      billing_day: 10,
      category_id: null,
      color: '#0000ff',
      logo_url: null,
      notes: null,
      is_active: true,
      status: 'active' as const,
      shared_count: 1,
      next_payment_date: '2024-02-10',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }

    useSubscriptionStore.setState({
      subscriptions: [yearlySub],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    const day10 = result.current.calendarDays.find((d) => d.dayOfMonth === 10)
    const yearlyPayment = day10?.payments.find((p) => p.subscription.name === 'Yearly Service')
    expect(yearlyPayment).toBeDefined()
    expect(yearlyPayment?.amount).toBe(99.99)
  })

  it('excludes yearly subscription when next_payment_date is in different month', async () => {
    const yearlySub = {
      id: 'sub-yearly',
      name: 'Yearly Service',
      amount: 99.99,
      currency: 'USD',
      billing_cycle: 'yearly' as const,
      billing_day: 10,
      category_id: null,
      color: '#0000ff',
      logo_url: null,
      notes: null,
      is_active: true,
      status: 'active' as const,
      shared_count: 1,
      // March, not February
      next_payment_date: '2024-03-10',
      created_at: '2024-01-01T00:00:00.000Z',
      updated_at: '2024-01-01T00:00:00.000Z',
    }

    useSubscriptionStore.setState({
      subscriptions: [yearlySub],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    const allPayments = result.current.calendarDays.flatMap((d) => d.payments)
    expect(allPayments).toHaveLength(0)
  })

  it('getPaymentsForDate returns empty for a date with no payments', async () => {
    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      expect(result.current.calendarDays.length).toBeGreaterThan(0)
    })

    // Feb 3 should have no payments
    const payments = result.current.getPaymentsForDate(new Date(2024, 1, 3))
    expect(payments).toHaveLength(0)
  })

  it('marks payments as paid when payment record exists', async () => {
    const mockFetch = vi.fn().mockResolvedValue([
      {
        id: 'pay-1',
        subscription_id: 'sub-1',
        due_date: '2024-02-15',
        amount: 15.99,
        status: 'paid',
        created_at: '2024-02-15T00:00:00.000Z',
      },
    ])

    usePaymentStore.setState({
      payments: [],
      isLoading: false,
      error: null,
      fetchPaymentsByMonth: mockFetch,
    })

    const { result } = renderHook(() => useCalendarStats(currentDate))

    await waitFor(() => {
      const day15 = result.current.calendarDays.find((d) => d.dayOfMonth === 15)
      const netflixPayment = day15?.payments.find((p) => p.subscription.name === 'Netflix')
      expect(netflixPayment?.isPaid).toBe(true)
    })
  })
})
