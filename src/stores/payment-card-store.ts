import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type { PaymentCard, PaymentCardFormData } from '@/types/payment-card'

type PaymentCardUpdate = Partial<Omit<PaymentCard, 'id' | 'created_at'>>

interface PaymentCardState {
  cards: PaymentCard[]
  isLoading: boolean
  error: string | null
  fetch: () => Promise<void>
  add: (data: PaymentCardFormData) => Promise<PaymentCard>
  update: (id: string, data: PaymentCardUpdate) => Promise<void>
  remove: (id: string) => Promise<void>
  getCard: (id: string | null | undefined) => PaymentCard | undefined
}

export const usePaymentCardStore = create<PaymentCardState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let pending = 0
  type Mutation = {
    data: PaymentCardUpdate | null
    settled: boolean
    failed: boolean
    result?: PaymentCard
  }
  const mutations = new Map<
    string,
    { base: PaymentCard | undefined; index: number; entries: Mutation[] }
  >()
  const mutate = async (
    id: string,
    data: PaymentCardUpdate | null,
    request: () => Promise<PaymentCard | void>
  ) => {
    const journal = mutations.get(id) ?? {
      base: get().cards.find((c) => c.id === id),
      index: get().cards.findIndex((c) => c.id === id),
      entries: [],
    }
    const mutation: Mutation = { data, settled: false, failed: false }
    journal.entries.push(mutation)
    mutations.set(id, journal)
    generation++
    pending++
    const publish = () => {
      let card = journal.base
      for (const entry of journal.entries) {
        if (entry.failed) continue
        card = entry.settled
          ? entry.result
          : entry.data === null
            ? undefined
            : card
              ? { ...card, ...entry.data }
              : undefined
      }
      set((state) => {
        const cards = state.cards.filter((c) => c.id !== id)
        if (card) cards.splice(journal.index, 0, card)
        return { cards }
      })
    }
    publish()
    try {
      mutation.result = (await request()) || undefined
    } catch (error) {
      mutation.failed = true
      set({ error: String(error) })
      throw error
    } finally {
      mutation.settled = true
      publish()
      pending--
      generation++
      if (journal.entries.every((entry) => entry.settled)) mutations.delete(id)
    }
  }
  return {
    cards: [],
    isLoading: false,
    error: null,
    fetch: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = pending === 0
      set({ isLoading: true, error: null })
      try {
        const cards = await invoke('list_payment_cards')
        if (request === fetchRequest && started === generation && canPublish) set({ cards })
      } catch (error) {
        if (request === fetchRequest) set({ error: String(error) })
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },
    add: async (data) => {
      generation++
      pending++
      try {
        const card = await invoke('create_payment_card', {
          data: {
            name: data.name,
            card_type: data.card_type,
            last_four: data.last_four || null,
            color: data.color,
            credit_limit: data.credit_limit || null,
          },
        })
        set((state) => ({ cards: [...state.cards.filter((c) => c.id !== card.id), card] }))
        return card
      } catch (error) {
        set({ error: String(error) })
        throw error
      } finally {
        pending--
        generation++
      }
    },
    update: (id, data) => mutate(id, data, () => invoke('update_payment_card', { id, data })),
    remove: (id) => mutate(id, null, () => invoke('delete_payment_card', { id })),
    getCard: (id) => (id ? get().cards.find((c) => c.id === id) : undefined),
  }
})
