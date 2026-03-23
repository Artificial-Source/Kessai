import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDashboardStats } from '../use-dashboard-stats'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'

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

    // totalYearly = totalMonthly * 12
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

  it('calculates monthly spending trend', () => {
    const { result } = renderHook(() => useDashboardStats())

    const { monthlySpending } = result.current

    // Should have 6 months of data
    expect(monthlySpending).toHaveLength(6)

    // Each entry should have month, monthLabel, and amount
    monthlySpending.forEach((entry) => {
      expect(entry).toHaveProperty('month')
      expect(entry).toHaveProperty('monthLabel')
      expect(entry).toHaveProperty('amount')
      expect(entry.month).toMatch(/^\d{4}-\d{2}$/)
      expect(entry.monthLabel).toMatch(/^[A-Z][a-z]{2}$/)
    })
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
  })
})
