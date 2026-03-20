import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { usePriceHistory } from '../use-price-history'
import { usePriceHistoryStore } from '@/stores/price-history-store'
import type { PriceChange } from '@/types/price-history'

const mockPriceChanges: PriceChange[] = [
  {
    id: 'ph-1',
    subscription_id: 'sub-1',
    old_amount: 12.99,
    new_amount: 15.99,
    old_currency: 'USD',
    new_currency: 'USD',
    changed_at: '2024-01-15T00:00:00.000Z',
  },
  {
    id: 'ph-2',
    subscription_id: 'sub-1',
    old_amount: 9.99,
    new_amount: 12.99,
    old_currency: 'USD',
    new_currency: 'USD',
    changed_at: '2023-06-01T00:00:00.000Z',
  },
]

describe('usePriceHistory', () => {
  beforeEach(() => {
    usePriceHistoryStore.setState({
      recentChanges: [],
      isLoading: false,
      error: null,
      fetchBySubscription: vi.fn().mockResolvedValue(mockPriceChanges),
      fetchRecent: vi.fn().mockResolvedValue(undefined),
      getLatest: vi.fn().mockResolvedValue(null),
    })
  })

  it('fetches price history for subscription on mount', async () => {
    const mockFetchBySubscription = vi.fn().mockResolvedValue(mockPriceChanges)
    usePriceHistoryStore.setState({ fetchBySubscription: mockFetchBySubscription })

    renderHook(() => usePriceHistory('sub-1'))

    await waitFor(() => {
      expect(mockFetchBySubscription).toHaveBeenCalledWith('sub-1')
    })
  })

  it('returns price changes after fetch', async () => {
    const { result } = renderHook(() => usePriceHistory('sub-1'))

    await waitFor(() => {
      expect(result.current.changes).toHaveLength(2)
    })

    expect(result.current.changes[0].old_amount).toBe(12.99)
    expect(result.current.changes[0].new_amount).toBe(15.99)
  })

  it('returns empty changes when no subscription id provided', async () => {
    const mockFetchBySubscription = vi.fn().mockResolvedValue([])
    usePriceHistoryStore.setState({ fetchBySubscription: mockFetchBySubscription })

    const { result } = renderHook(() => usePriceHistory(undefined))

    // Should not call fetch when no subscriptionId
    expect(mockFetchBySubscription).not.toHaveBeenCalled()
    expect(result.current.changes).toHaveLength(0)
  })

  it('handles empty history', async () => {
    usePriceHistoryStore.setState({
      fetchBySubscription: vi.fn().mockResolvedValue([]),
    })

    const { result } = renderHook(() => usePriceHistory('sub-no-history'))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.changes).toHaveLength(0)
  })

  it('sets loading state during fetch', async () => {
    let resolvePromise: (value: PriceChange[]) => void
    const pendingPromise = new Promise<PriceChange[]>((resolve) => {
      resolvePromise = resolve
    })

    usePriceHistoryStore.setState({
      fetchBySubscription: vi.fn().mockReturnValue(pendingPromise),
    })

    const { result } = renderHook(() => usePriceHistory('sub-1'))

    // Should be loading while fetch is pending
    await waitFor(() => {
      expect(result.current.isLoading).toBe(true)
    })

    // Resolve the promise
    resolvePromise!(mockPriceChanges)

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })
  })

  it('refetch triggers a new fetch', async () => {
    const mockFetchBySubscription = vi.fn().mockResolvedValue(mockPriceChanges)
    usePriceHistoryStore.setState({ fetchBySubscription: mockFetchBySubscription })

    const { result } = renderHook(() => usePriceHistory('sub-1'))

    await waitFor(() => {
      expect(mockFetchBySubscription).toHaveBeenCalledTimes(1)
    })

    await result.current.refetch()

    expect(mockFetchBySubscription).toHaveBeenCalledTimes(2)
  })

  it('re-fetches when subscriptionId changes', async () => {
    const mockFetchBySubscription = vi.fn().mockResolvedValue([])
    usePriceHistoryStore.setState({ fetchBySubscription: mockFetchBySubscription })

    const { rerender } = renderHook(({ id }) => usePriceHistory(id), {
      initialProps: { id: 'sub-1' },
    })

    await waitFor(() => {
      expect(mockFetchBySubscription).toHaveBeenCalledWith('sub-1')
    })

    rerender({ id: 'sub-2' })

    await waitFor(() => {
      expect(mockFetchBySubscription).toHaveBeenCalledWith('sub-2')
    })
  })
})
