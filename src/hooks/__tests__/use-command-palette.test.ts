import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { StrictMode } from 'react'
import { useCommandPalette } from '../use-command-palette'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Subscription } from '@/types/subscription'

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiInvoke: (...args: unknown[]) => mockInvoke(...args) }))

function subscription(overrides: Partial<Subscription>): Subscription {
  return {
    id: 'sub',
    name: 'Netflix',
    amount: 15.49,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: null,
    category_id: null,
    color: null,
    logo_url: null,
    notes: null,
    is_active: true,
    next_payment_date: '2026-11-01',
    status: 'active',
    shared_count: 1,
    is_pinned: false,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('useCommandPalette', () => {
  beforeEach(() => {
    mockInvoke.mockReset().mockResolvedValue([])
    useSubscriptionStore.setState({
      subscriptions: [],
      isLoading: false,
      error: null,
      fetchError: null,
    })
    useUiStore.setState({ commandPaletteOpen: false })
    useSettingsStore.setState({ settings: { id: 'singleton', ...DEFAULT_SETTINGS } })
    useCategoryStore.setState({
      categories: [
        {
          id: 'cat-other',
          name: 'Other',
          color: '#6b7280',
          icon: 'box',
          is_default: true,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    })
  })

  it('loads subscriptions once when an empty palette opens on a cold route', async () => {
    mockInvoke.mockResolvedValue([subscription({})])
    const { result, rerender } = renderHook(({ query }) => useCommandPalette(query), {
      initialProps: { query: 'Netflix' },
    })
    expect(mockInvoke).not.toHaveBeenCalled()

    act(() => useUiStore.getState().openCommandPalette())

    await waitFor(() =>
      expect(result.current[0]).toMatchObject({
        type: 'subscription',
        results: [expect.objectContaining({ title: 'Netflix', subscriptionId: 'sub' })],
      })
    )
    rerender({ query: 'Net' })
    act(() => useUiStore.getState().closeCommandPalette())
    act(() => useUiStore.getState().openCommandPalette())
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith('list_subscriptions')
  })

  it('does not repeat an empty subscription fetch until the palette opens again', async () => {
    const { rerender } = renderHook(({ query }) => useCommandPalette(query), {
      initialProps: { query: '' },
    })
    await act(async () => useUiStore.getState().openCommandPalette())
    await waitFor(() => expect(useSubscriptionStore.getState().isLoading).toBe(false))

    rerender({ query: 'missing' })
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith('list_subscriptions')

    await act(async () => useUiStore.getState().closeCommandPalette())
    await act(async () => useUiStore.getState().openCommandPalette())
    expect(mockInvoke).toHaveBeenCalledTimes(2)
  })

  it('does not duplicate an in-flight subscription fetch under StrictMode', async () => {
    useUiStore.setState({ commandPaletteOpen: true })
    renderHook(() => useCommandPalette(''), { wrapper: StrictMode })

    await waitFor(() => expect(useSubscriptionStore.getState().isLoading).toBe(false))
    expect(mockInvoke).toHaveBeenCalledExactlyOnceWith('list_subscriptions')
  })

  it('does not fetch when subscriptions are already loading', () => {
    useSubscriptionStore.setState({ isLoading: true })
    renderHook(() => useCommandPalette('Netflix'))

    act(() => useUiStore.getState().openCommandPalette())

    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('formats each subscription in its own currency, not the display currency', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        subscription({
          id: 'lessons',
          name: 'Japanese Lessons',
          amount: 3200,
          currency: 'JPY',
          category_id: 'cat-other',
        }),
      ],
    })

    const { result } = renderHook(() => useCommandPalette('lessons'))
    const [group] = result.current

    expect(group.type).toBe('subscription')
    expect(group.results[0].subtitle).toMatch(/[¥￥]\s?3,200/)
    expect(group.results[0].subtitle).not.toContain('$')
    expect(group.results[0].subtitle).toContain('/mo')
    expect(group.results[0].subtitle).toContain('Other')
  })

  it('offers the keyboard shortcuts reference as an action', () => {
    useSubscriptionStore.setState({ subscriptions: [] })

    const { result } = renderHook(() => useCommandPalette('shortcut'))

    expect(result.current).toEqual([
      expect.objectContaining({
        type: 'action',
        results: [expect.objectContaining({ action: 'show-shortcuts' })],
      }),
    ])
  })
})
