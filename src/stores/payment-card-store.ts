import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
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
      set({ error: (error as Error).message || String(error), isLoading: false })
    }
  },

  add: async (data) => {
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
  },

  update: async (id, data) => {
    const updated = await invoke<PaymentCard>('update_payment_card', { id, data })
    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? updated : c)),
    }))
  },

  remove: async (id) => {
    await invoke('delete_payment_card', { id })
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) }))
  },

  getCard: (id) => {
    if (!id) return undefined
    return get().cards.find((c) => c.id === id)
  },
}))
