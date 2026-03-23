import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type { PaymentCard, PaymentCardFormData } from '@/types/payment-card'

interface PaymentCardState {
  cards: PaymentCard[]
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  add: (data: PaymentCardFormData) => Promise<PaymentCard>
  update: (id: string, data: Partial<PaymentCardFormData>) => Promise<void>
  remove: (id: string) => Promise<void>
  getCard: (id: string | null | undefined) => PaymentCard | undefined
}

export const usePaymentCardStore = create<PaymentCardState>((set, get) => ({
  cards: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const rows = await invoke<PaymentCard[]>('list_payment_cards')
      set({ cards: rows, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  add: async (data) => {
    try {
      const card = await invoke<PaymentCard>('create_payment_card', {
        data: {
          name: data.name,
          card_type: data.card_type,
          last_four: data.last_four || null,
          color: data.color,
          credit_limit: data.credit_limit || null,
        },
      })
      set((state) => ({ cards: [...state.cards, card] }))
      return card
    } catch (error) {
      set({ error: String(error) })
      console.error('Failed to add payment card:', error)
      throw error
    }
  },

  update: async (id, data) => {
    const previousCards = get().cards
    try {
      const updated = await invoke<PaymentCard>('update_payment_card', { id, data })
      set((state) => ({
        cards: state.cards.map((c) => (c.id === id ? updated : c)),
      }))
    } catch (error) {
      set({ cards: previousCards, error: String(error) })
      console.error('Failed to update payment card:', error)
      throw error
    }
  },

  remove: async (id) => {
    const previousCards = get().cards
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) }))
    try {
      await invoke('delete_payment_card', { id })
    } catch (error) {
      set({ cards: previousCards, error: String(error) })
      console.error('Failed to remove payment card:', error)
      throw error
    }
  },

  getCard: (id) => {
    if (!id) return undefined
    return get().cards.find((c) => c.id === id)
  },
}))
