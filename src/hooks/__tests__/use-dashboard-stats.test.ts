import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import dayjs from 'dayjs'
import { calculateAsBilledTotal, useDashboardStats } from '../use-dashboard-stats'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Subscription } from '@/types/subscription'

// Mock data
const mockSubscriptions = [
  {
    id: 'sub-1',
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: null,
    category_id: 'cat-streaming',
    color: '#e50914',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    is_pinned: false,
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
    billing_day: null,
    category_id: 'cat-music',
    color: '#1db954',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    is_pinned: false,
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
    billing_day: null,
    category_id: 'cat-software',
    color: '#ff0000',
    logo_url: null,
    notes: null,
    is_active: false, // Inactive subscription
    status: 'cancelled' as const,
    shared_count: 1,
    is_pinned: false,
    next_payment_date: '2024-02-25',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sub-4',
    name: 'Amazon Prime',
    amount: 139,
    currency: 'USD',
    billing_cycle: 'yearly' as const,
    billing_day: null,
    category_id: 'cat-streaming',
    color: '#ff9900',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    is_pinned: false,
    next_payment_date: '2024-12-01',
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
  {
    id: 'cat-software',
    name: 'Software',
    color: '#3b82f6',
    icon: 'code',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'subscription',
  name: 'Subscription',
  amount: 10,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: null,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: null,
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

const inDays = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD')

const setDisplayCurrency = (currency: string) =>
  useSettingsStore.setState({
    settings: { id: 'singleton', ...DEFAULT_SETTINGS, currency },
    isLoading: false,
    error: null,
  })

describe('useDashboardStats', () => {
  beforeEach(() => {
    // Reset stores with mock data
    useSubscriptionStore.setState({
      subscriptions: mockSubscriptions,
      isLoading: false,
      error: null,
    })

    useCategoryStore.setState({
      categories: mockCategories,
      isLoading: false,
      error: null,
    })

    setDisplayCurrency('USD')
  })

  it('calculates activeCount correctly', () => {
    const { result } = renderHook(() => useDashboardStats())

    // Only active subscriptions: Netflix, Spotify, Amazon Prime (Adobe CC is inactive)
    expect(result.current.activeCount).toBe(3)
  })

  it('calculates totalCount correctly', () => {
    const { result } = renderHook(() => useDashboardStats())

    expect(result.current.totalCount).toBe(4)
  })

  it('calculates totalMonthly correctly', () => {
    const { result } = renderHook(() => useDashboardStats())

    // Netflix: $15.99/month
    // Spotify: $9.99/month
    // Amazon Prime: $139/year = $11.58/month
    // Total: ~$37.56
    expect(result.current.totalMonthly).toBeCloseTo(37.57, 1)
  })

  it('calculates totalYearly correctly', () => {
    const { result } = renderHook(() => useDashboardStats())

    // 15.99 * 12 + 9.99 * 12 + 139
    expect(result.current.totalYearly).toBeCloseTo(450.76, 2)
    expect(result.current.totalYearly).toBeCloseTo(result.current.totalMonthly * 12, 1)
  })

  it('calculates categorySpending correctly', () => {
    const { result } = renderHook(() => useDashboardStats())

    const { categorySpending } = result.current

    // Should have 2 categories (Streaming with Netflix + Amazon Prime, Music with Spotify)
    // Adobe CC is inactive, so Software shouldn't appear
    expect(categorySpending).toHaveLength(2)

    // Find Streaming category
    const streaming = categorySpending.find((c) => c.name === 'Streaming')
    expect(streaming).toBeDefined()
    // Netflix ($15.99) + Amazon Prime ($11.58/month)
    expect(streaming?.amount).toBeCloseTo(27.57, 1)

    // Find Music category
    const music = categorySpending.find((c) => c.name === 'Music')
    expect(music).toBeDefined()
    expect(music?.amount).toBeCloseTo(9.99, 1)
  })

  it('sorts categorySpending by amount descending', () => {
    const { result } = renderHook(() => useDashboardStats())

    const { categorySpending } = result.current

    for (let i = 0; i < categorySpending.length - 1; i++) {
      expect(categorySpending[i].amount).toBeGreaterThanOrEqual(categorySpending[i + 1].amount)
    }
  })

  it('returns empty arrays when no subscriptions', () => {
    useSubscriptionStore.setState({
      subscriptions: [],
      isLoading: false,
      error: null,
    })

    const { result } = renderHook(() => useDashboardStats())

    expect(result.current.activeCount).toBe(0)
    expect(result.current.totalCount).toBe(0)
    expect(result.current.totalMonthly).toBe(0)
    expect(result.current.totalYearly).toBe(0)
    expect(result.current.categorySpending).toHaveLength(0)
    expect(result.current.upcomingPayments).toHaveLength(0)
    expect(result.current.upcomingTotal).toBe(0)
    expect(result.current.excludedCurrencies).toEqual({})
  })

  it('excludes inactive subscriptions from calculations', () => {
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

    const { result } = renderHook(() => useDashboardStats())

    expect(result.current.activeCount).toBe(0)
    expect(result.current.totalMonthly).toBe(0)
    expect(result.current.categorySpending).toHaveLength(0)
    expect(result.current.monthlySubsCount).toBe(0)
    expect(result.current.yearlySubsCount).toBe(0)
  })

  describe('user share in the display currency', () => {
    const mixed = [
      // $60 split three ways: $20/mo
      subscription({ id: 'stream', amount: 60, shared_count: 3, category_id: 'cat-streaming' }),
      // $120/yr split two ways: $60/yr, $5/mo
      subscription({
        id: 'tunes',
        amount: 120,
        billing_cycle: 'yearly',
        shared_count: 2,
        category_id: 'cat-music',
      }),
      // Trial is billable: $40 split four ways, $10/mo
      subscription({ id: 'gym', amount: 40, shared_count: 4, status: 'trial' }),
      subscription({ id: 'anime', amount: 1200, currency: 'JPY', category_id: 'cat-streaming' }),
      subscription({
        id: 'suite',
        amount: 99,
        currency: 'EUR',
        billing_cycle: 'yearly',
        category_id: 'cat-software',
      }),
      subscription({ id: 'paused', amount: 30, is_active: false, status: 'paused' }),
    ]

    beforeEach(() => {
      useSubscriptionStore.setState({ subscriptions: mixed, isLoading: false, error: null })
    })

    it('totals only the user share of billable display-currency subscriptions', () => {
      const { result } = renderHook(() => useDashboardStats())

      expect(result.current.totalMonthly).toBeCloseTo(35, 10)
      expect(result.current.totalYearly).toBeCloseTo(420, 10)
      expect(result.current.excludedCurrencies).toEqual({ JPY: 1, EUR: 1 })
      // Active count lists every billable subscription, whatever its currency.
      expect(result.current.activeCount).toBe(5)
    })

    it('keeps per-cycle totals as billed, with counts and exclusions per cycle', () => {
      const { result } = renderHook(() => useDashboardStats())

      expect(result.current.monthlySubsTotal).toBeCloseTo(30, 10)
      expect(result.current.monthlySubsCount).toBe(2)
      expect(result.current.monthlySubsExcludedCurrencies).toEqual({ JPY: 1 })
      expect(result.current.yearlySubsTotal).toBeCloseTo(60, 10)
      expect(result.current.yearlySubsCount).toBe(1)
      expect(result.current.yearlySubsExcludedCurrencies).toEqual({ EUR: 1 })
    })

    it('breaks categories down by user share, dropping other-currency-only categories', () => {
      const { result } = renderHook(() => useDashboardStats())

      expect(
        result.current.categorySpending.map(({ name, amount, percentage }) => ({
          name,
          amount: Number(amount.toFixed(2)),
          percentage: Number(percentage.toFixed(1)),
        }))
      ).toEqual([
        { name: 'Streaming', amount: 20, percentage: 57.1 },
        { name: 'Uncategorized', amount: 10, percentage: 28.6 },
        { name: 'Music', amount: 5, percentage: 14.3 },
      ])
    })

    it('follows the settings currency for inclusion', () => {
      setDisplayCurrency('JPY')

      const { result } = renderHook(() => useDashboardStats())

      expect(result.current.totalMonthly).toBe(1200)
      expect(result.current.monthlySubsTotal).toBe(1200)
      expect(result.current.monthlySubsExcludedCurrencies).toEqual({ USD: 2 })
      expect(result.current.excludedCurrencies).toEqual({ USD: 3, EUR: 1 })
      expect(result.current.categorySpending.map((c) => c.name)).toEqual(['Streaming'])
    })
  })

  describe('upcoming payments', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [
          subscription({ id: 'stream', amount: 30, shared_count: 3, next_payment_date: inDays(2) }),
          subscription({
            id: 'tunes',
            amount: 120,
            billing_cycle: 'yearly',
            shared_count: 2,
            next_payment_date: inDays(3),
          }),
          subscription({
            id: 'locker',
            amount: 26,
            billing_cycle: 'weekly',
            next_payment_date: inDays(4),
          }),
          subscription({
            id: 'anime',
            amount: 1500,
            currency: 'JPY',
            next_payment_date: inDays(1),
          }),
          subscription({
            id: 'paused',
            amount: 50,
            is_active: false,
            status: 'paused',
            next_payment_date: inDays(2),
          }),
          subscription({ id: 'later', amount: 80, next_payment_date: inDays(20) }),
        ],
        isLoading: false,
        error: null,
      })
    })

    it('lists billable charges in the window in their own currency', () => {
      const { result } = renderHook(() => useDashboardStats())

      expect(
        result.current.upcomingPayments.map(({ id, amount, currency }) => ({
          id,
          amount,
          currency,
        }))
      ).toEqual([
        { id: 'anime', amount: 1500, currency: 'JPY' },
        { id: 'stream', amount: 30, currency: 'USD' },
        { id: 'tunes', amount: 120, currency: 'USD' },
        { id: 'locker', amount: 26, currency: 'USD' },
      ])
    })

    it('sums the as-billed user share due, excluding other currencies', () => {
      const { result } = renderHook(() => useDashboardStats())

      // $10 (30 / 3) + $60 (120 / 2, yearly charge, not normalized) + $26 weekly charge
      expect(result.current.upcomingTotal).toBeCloseTo(96, 10)
      expect(result.current.upcomingExcludedCurrencies).toEqual({ JPY: 1 })
    })
  })
})

describe('calculateAsBilledTotal', () => {
  it('sums one user-share charge per subscription without normalizing cycles', () => {
    expect(
      calculateAsBilledTotal(
        [
          subscription({ amount: 30, shared_count: 3 }),
          subscription({ amount: 90, billing_cycle: 'quarterly', shared_count: 3 }),
          subscription({ amount: 120, billing_cycle: 'yearly', shared_count: 2 }),
          subscription({ amount: 26, billing_cycle: 'weekly', status: 'grace_period' }),
          subscription({ amount: 15, billing_cycle: 'custom' }),
          subscription({ amount: 500, currency: 'GBP' }),
          subscription({ amount: 999, is_active: false, status: 'cancelled' }),
          subscription({ amount: 999, status: 'pending_cancellation' }),
        ],
        'USD'
      )
    ).toEqual({ amount: 141, count: 5, excludedCurrencies: { GBP: 1 } })
  })
})
