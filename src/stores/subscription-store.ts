import { create } from 'zustand'
import { query, execute } from '@/lib/database'
import type { Subscription, NewSubscription } from '@/types/subscription'

type SubscriptionState = {
  subscriptions: Subscription[]
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  add: (sub: NewSubscription) => Promise<void>
  update: (id: string, data: Partial<Subscription>) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const subs = await query<Subscription>(
        'SELECT * FROM subscriptions ORDER BY next_payment_date ASC'
      )
      set({
        subscriptions: subs.map((s) => ({ ...s, is_active: Boolean(s.is_active) })),
        isLoading: false,
      })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  add: async (sub) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    try {
      await execute(
        `INSERT INTO subscriptions 
         (id, name, amount, currency, billing_cycle, billing_day, category_id, color, logo_url, notes, is_active, next_payment_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          sub.name,
          sub.amount,
          sub.currency,
          sub.billing_cycle,
          sub.billing_day || null,
          sub.category_id || null,
          sub.color || null,
          sub.logo_url || null,
          sub.notes || null,
          sub.is_active ? 1 : 0,
          sub.next_payment_date,
          now,
          now,
        ]
      )
      await get().fetch()
    } catch (error) {
      console.error('Failed to add subscription:', error)
      throw error
    }
  },

  update: async (id, data) => {
    const fields: string[] = []
    const values: unknown[] = []

    Object.entries(data).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at') {
        fields.push(`${key} = ?`)
        values.push(key === 'is_active' ? (value ? 1 : 0) : value)
      }
    })

    fields.push('updated_at = ?')
    values.push(new Date().toISOString())
    values.push(id)

    await execute(`UPDATE subscriptions SET ${fields.join(', ')} WHERE id = ?`, values)
    await get().fetch()
  },

  remove: async (id) => {
    await execute('DELETE FROM subscriptions WHERE id = ?', [id])
    set((state) => ({
      subscriptions: state.subscriptions.filter((s) => s.id !== id),
    }))
  },

  toggleActive: async (id) => {
    const sub = get().subscriptions.find((s) => s.id === id)
    if (sub) {
      await get().update(id, { is_active: !sub.is_active })
    }
  },
}))
