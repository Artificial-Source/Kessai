import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { PriceChange } from '@/types/price-history'

type PriceHistoryState = {
  recentChanges: PriceChange[]
  isLoading: boolean
  error: string | null

  fetchRecent: (days?: number) => Promise<void>
  fetchBySubscription: (subscriptionId: string) => Promise<PriceChange[]>
  getLatest: (subscriptionId: string) => Promise<PriceChange | null>
}

export const usePriceHistoryStore = create<PriceHistoryState>((set) => ({
  recentChanges: [],
  isLoading: false,
  error: null,

  fetchRecent: async (days = 90) => {
    set({ isLoading: true, error: null })
    try {
      const changes = await invoke<PriceChange[]>('get_recent_price_changes', { days })
      set({ recentChanges: changes, isLoading: false })
    } catch (e) {
      console.error('Failed to fetch recent price changes:', e)
      set({ error: String(e), isLoading: false })
    }
  },

  fetchBySubscription: async (subscriptionId: string) => {
    const changes = await invoke<PriceChange[]>('list_price_history', { subscriptionId })
    return changes
  },

  getLatest: async (subscriptionId: string) => {
    try {
      const changes = await invoke<PriceChange[]>('list_price_history', { subscriptionId })
      return changes.length > 0 ? changes[0] : null
    } catch (e) {
      console.error('Failed to get latest price change:', e)
      return null
    }
  },
}))
