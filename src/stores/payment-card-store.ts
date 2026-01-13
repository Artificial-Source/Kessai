import { create } from 'zustand'
import { query, execute } from '@/lib/database'
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
      const rows = await query<PaymentCard>('SELECT * FROM payment_cards ORDER BY name')
      set({ cards: rows, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  add: async (data) => {
    const id = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = new Date().toISOString()

    await execute(
      `INSERT INTO payment_cards (id, name, card_type, last_four, color, credit_limit, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.card_type,
        data.last_four || null,
        data.color,
        data.credit_limit || null,
        now,
      ]
    )

    const card: PaymentCard = {
      id,
      ...data,
      last_four: data.last_four || null,
      credit_limit: data.credit_limit || null,
      created_at: now,
    }

    set((state) => ({ cards: [...state.cards, card] }))
    return card
  },

  update: async (id, data) => {
    const fields: string[] = []
    const values: unknown[] = []

    if (data.name !== undefined) {
      fields.push('name = ?')
      values.push(data.name)
    }
    if (data.card_type !== undefined) {
      fields.push('card_type = ?')
      values.push(data.card_type)
    }
    if (data.last_four !== undefined) {
      fields.push('last_four = ?')
      values.push(data.last_four)
    }
    if (data.color !== undefined) {
      fields.push('color = ?')
      values.push(data.color)
    }
    if (data.credit_limit !== undefined) {
      fields.push('credit_limit = ?')
      values.push(data.credit_limit)
    }

    if (fields.length === 0) return

    values.push(id)
    await execute(`UPDATE payment_cards SET ${fields.join(', ')} WHERE id = ?`, values)

    set((state) => ({
      cards: state.cards.map((c) => (c.id === id ? { ...c, ...data } : c)),
    }))
  },

  remove: async (id) => {
    await execute('UPDATE subscriptions SET card_id = NULL WHERE card_id = ?', [id])
    await execute('DELETE FROM payment_cards WHERE id = ?', [id])
    set((state) => ({ cards: state.cards.filter((c) => c.id !== id) }))
  },

  getCard: (id) => {
    if (!id) return undefined
    return get().cards.find((c) => c.id === id)
  },
}))
