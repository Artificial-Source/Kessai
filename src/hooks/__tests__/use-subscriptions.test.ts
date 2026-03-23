import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSubscriptions } from '../use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'

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
    is_active: false,
    status: 'cancelled' as const,
    shared_count: 1,
    is_pinned: false,
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
  {
    id: 'cat-software',
    name: 'Software',
    color: '#3b82f6',
    icon: 'code',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

describe('useSubscriptions', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      subscriptions: mockSubscriptions,
      isLoading: false,
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      toggleActive: vi.fn().mockResolvedValue(undefined),
    })

    useCategoryStore.setState({
      categories: mockCategories,
      isLoading: false,
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
    })

    useSettingsStore.setState({
      settings: {
        id: 'singleton',
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        monthly_budget: null,
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
      isLoading: false,
      error: null,
    })
  })

  it('returns subscriptions from store', () => {
    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.subscriptions).toHaveLength(3)
    expect(result.current.subscriptions[0].name).toBe('Netflix')
  })

  it('returns only active subscriptions in activeSubscriptions', () => {
    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.activeSubscriptions).toHaveLength(2)
    expect(result.current.activeSubscriptions.every((s) => s.is_active)).toBe(true)
  })

  it('getCategory returns correct category', () => {
    const { result } = renderHook(() => useSubscriptions())

    const category = result.current.getCategory('cat-streaming')
    expect(category).toBeDefined()
    expect(category?.name).toBe('Streaming')
  })

  it('getCategory returns undefined for null category_id', () => {
    const { result } = renderHook(() => useSubscriptions())

    const category = result.current.getCategory(null)
    expect(category).toBeUndefined()
  })

  it('getCategory returns undefined for unknown category_id', () => {
    const { result } = renderHook(() => useSubscriptions())

    const category = result.current.getCategory('unknown-id')
    expect(category).toBeUndefined()
  })

  it('remove calls store remove', async () => {
    const mockRemove = vi.fn().mockResolvedValue(undefined)
    useSubscriptionStore.setState({ remove: mockRemove })

    const { result } = renderHook(() => useSubscriptions())

    await act(async () => {
      await result.current.remove('sub-1')
    })

    expect(mockRemove).toHaveBeenCalledWith('sub-1')
  })

  it('toggleActive calls store toggleActive', async () => {
    const mockToggleActive = vi.fn().mockResolvedValue(undefined)
    useSubscriptionStore.setState({ toggleActive: mockToggleActive })

    const { result } = renderHook(() => useSubscriptions())

    await act(async () => {
      await result.current.toggleActive('sub-1')
    })

    expect(mockToggleActive).toHaveBeenCalledWith('sub-1')
  })

  it('calculates totalMonthly for active subscriptions', () => {
    const { result } = renderHook(() => useSubscriptions())

    // Netflix ($15.99) + Spotify ($9.99) = $25.98 monthly
    expect(result.current.totalMonthly).toBeCloseTo(25.98, 1)
  })

  it('calculates totalYearly as totalMonthly * 12', () => {
    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.totalYearly).toBeCloseTo(result.current.totalMonthly * 12, 1)
  })

  it('returns empty arrays when no subscriptions', () => {
    useSubscriptionStore.setState({
      subscriptions: [],
      isLoading: false,
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      toggleActive: vi.fn().mockResolvedValue(undefined),
    })

    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.subscriptions).toHaveLength(0)
    expect(result.current.activeSubscriptions).toHaveLength(0)
    expect(result.current.totalMonthly).toBe(0)
    expect(result.current.totalYearly).toBe(0)
  })

  it('calls fetch on mount', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useSubscriptionStore.setState({ fetch: mockFetch })

    renderHook(() => useSubscriptions())

    expect(mockFetch).toHaveBeenCalled()
  })

  it('returns loading state', () => {
    useSubscriptionStore.setState({ isLoading: true })

    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns error state', () => {
    useSubscriptionStore.setState({ error: 'Failed to load' })

    const { result } = renderHook(() => useSubscriptions())

    expect(result.current.error).toBe('Failed to load')
  })

  it('getSubscriptionWithCategory returns subscription with category attached', () => {
    const { result } = renderHook(() => useSubscriptions())

    const subWithCategory = result.current.getSubscriptionWithCategory(mockSubscriptions[0])

    expect(subWithCategory.name).toBe('Netflix')
    expect(subWithCategory.category).toBeDefined()
    expect(subWithCategory.category?.name).toBe('Streaming')
  })
})
