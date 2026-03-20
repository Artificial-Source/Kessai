import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePriceHistoryStore } from '../price-history-store'
import type { PriceChange } from '@/types/price-history'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

const mockPriceChanges: PriceChange[] = [
  {
    id: 'pc-1',
    subscription_id: 'sub-1',
    old_amount: 9.99,
    new_amount: 12.99,
    old_currency: 'USD',
    new_currency: 'USD',
    changed_at: '2025-06-01T00:00:00Z',
  },
  {
    id: 'pc-2',
    subscription_id: 'sub-1',
    old_amount: 12.99,
    new_amount: 14.99,
    old_currency: 'USD',
    new_currency: 'USD',
    changed_at: '2025-09-01T00:00:00Z',
  },
]

describe('usePriceHistoryStore', () => {
  beforeEach(() => {
    usePriceHistoryStore.setState({
      recentChanges: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('fetchRecent', () => {
    it('fetches recent price changes and updates state', async () => {
      mockInvoke.mockResolvedValue(mockPriceChanges)

      await usePriceHistoryStore.getState().fetchRecent()

      expect(mockInvoke).toHaveBeenCalledWith('get_recent_price_changes', { days: 90 })
      const state = usePriceHistoryStore.getState()
      expect(state.recentChanges).toEqual(mockPriceChanges)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('uses custom days parameter', async () => {
      mockInvoke.mockResolvedValue([])

      await usePriceHistoryStore.getState().fetchRecent(30)

      expect(mockInvoke).toHaveBeenCalledWith('get_recent_price_changes', { days: 30 })
    })

    it('sets loading state during fetch', async () => {
      mockInvoke.mockResolvedValue(mockPriceChanges)

      const fetchPromise = usePriceHistoryStore.getState().fetchRecent()
      expect(usePriceHistoryStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(usePriceHistoryStore.getState().isLoading).toBe(false)
    })

    it('handles fetch error', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await usePriceHistoryStore.getState().fetchRecent()

      const state = usePriceHistoryStore.getState()
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
      expect(state.recentChanges).toEqual([])
    })
  })

  describe('fetchBySubscription', () => {
    it('fetches price history for a subscription', async () => {
      mockInvoke.mockResolvedValue(mockPriceChanges)

      const result = await usePriceHistoryStore.getState().fetchBySubscription('sub-1')

      expect(mockInvoke).toHaveBeenCalledWith('list_price_history', { subscriptionId: 'sub-1' })
      expect(result).toEqual(mockPriceChanges)
    })

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Not found'))

      const result = await usePriceHistoryStore.getState().fetchBySubscription('sub-999')

      expect(result).toEqual([])
    })
  })

  describe('getLatest', () => {
    it('returns the first price change when history exists', async () => {
      mockInvoke.mockResolvedValue(mockPriceChanges)

      const result = await usePriceHistoryStore.getState().getLatest('sub-1')

      expect(mockInvoke).toHaveBeenCalledWith('list_price_history', { subscriptionId: 'sub-1' })
      expect(result).toEqual(mockPriceChanges[0])
    })

    it('returns null when no history exists', async () => {
      mockInvoke.mockResolvedValue([])

      const result = await usePriceHistoryStore.getState().getLatest('sub-1')

      expect(result).toBeNull()
    })

    it('returns null on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      const result = await usePriceHistoryStore.getState().getLatest('sub-1')

      expect(result).toBeNull()
    })
  })
})
