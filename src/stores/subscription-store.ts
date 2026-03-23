import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type { Subscription, NewSubscription, SubscriptionStatus } from '@/types/subscription'

type SubscriptionState = {
  subscriptions: Subscription[]
  needingReview: Subscription[]
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  add: (sub: NewSubscription) => Promise<Subscription>
  update: (id: string, data: Partial<Subscription>) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleActive: (id: string) => Promise<void>
  togglePinned: (id: string) => Promise<void>
  transitionStatus: (id: string, status: SubscriptionStatus) => Promise<void>
  cancel: (id: string, reason?: string) => Promise<void>
  markReviewed: (id: string) => Promise<void>
  fetchNeedingReview: (days?: number) => Promise<void>
}

const sortByPaymentDate = (a: Subscription, b: Subscription) => {
  // Pinned subscriptions always come first
  if (a.is_pinned && !b.is_pinned) return -1
  if (!a.is_pinned && b.is_pinned) return 1

  if (!a.next_payment_date && !b.next_payment_date) return 0
  if (!a.next_payment_date) return 1
  if (!b.next_payment_date) return -1
  return new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime()
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => ({
  subscriptions: [],
  needingReview: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const subs = await invoke<Subscription[]>('list_subscriptions')
      set({ subscriptions: subs, isLoading: false })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  add: async (sub) => {
    // Optimistic: build a temporary local subscription
    const optimisticId = crypto.randomUUID()
    const now = new Date().toISOString()
    const newSubscription: Subscription = {
      id: optimisticId,
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      billing_cycle: sub.billing_cycle,
      billing_day: sub.billing_day || null,
      category_id: sub.category_id || null,
      color: sub.color || null,
      logo_url: sub.logo_url || null,
      notes: sub.notes || null,
      is_active: sub.is_active ?? true,
      next_payment_date: sub.next_payment_date,
      card_id: sub.card_id || null,
      status: sub.status ?? 'active',
      trial_end_date: sub.trial_end_date ?? null,
      status_changed_at: now,
      shared_count: sub.shared_count ?? 1,
      is_pinned: sub.is_pinned ?? false,
      last_reviewed_at: null,
      created_at: now,
      updated_at: now,
    }

    set((state) => ({
      subscriptions: [...state.subscriptions, newSubscription].sort(sortByPaymentDate),
    }))

    try {
      const created = await invoke<Subscription>('create_subscription', { data: sub })
      // Replace optimistic entry with real one from backend
      set((state) => ({
        subscriptions: state.subscriptions
          .map((s) => (s.id === optimisticId ? created : s))
          .sort(sortByPaymentDate),
      }))
      return created
    } catch (error) {
      // Rollback
      set((state) => ({
        subscriptions: state.subscriptions.filter((s) => s.id !== optimisticId),
      }))
      console.error('Failed to add subscription:', error)
      throw error
    }
  },

  update: async (id, data) => {
    const previousSubscriptions = get().subscriptions
    const subscription = previousSubscriptions.find((s) => s.id === id)
    if (!subscription) return

    // Optimistic update
    set((state) => ({
      subscriptions: state.subscriptions
        .map((s) => (s.id === id ? { ...s, ...data, updated_at: new Date().toISOString() } : s))
        .sort(sortByPaymentDate),
    }))

    try {
      const updated = await invoke<Subscription>('update_subscription', { id, data })
      set((state) => ({
        subscriptions: state.subscriptions
          .map((s) => (s.id === id ? updated : s))
          .sort(sortByPaymentDate),
      }))
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to update subscription:', error)
      throw error
    }
  },

  remove: async (id) => {
    const previousSubscriptions = get().subscriptions

    set((state) => ({
      subscriptions: state.subscriptions.filter((s) => s.id !== id),
    }))

    try {
      await invoke('delete_subscription', { id })
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to remove subscription:', error)
      throw error
    }
  },

  toggleActive: async (id) => {
    const previousSubscriptions = get().subscriptions
    const sub = previousSubscriptions.find((s) => s.id === id)
    if (!sub) return

    // Optimistic toggle
    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id ? { ...s, is_active: !s.is_active } : s
      ),
    }))

    try {
      const updated = await invoke<Subscription>('toggle_subscription_active', { id })
      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.id === id ? updated : s)),
      }))
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to toggle subscription:', error)
      throw error
    }
  },

  togglePinned: async (id) => {
    const previousSubscriptions = get().subscriptions
    const sub = previousSubscriptions.find((s) => s.id === id)
    if (!sub) return

    // Optimistic toggle
    set((state) => ({
      subscriptions: state.subscriptions
        .map((s) => (s.id === id ? { ...s, is_pinned: !s.is_pinned } : s))
        .sort(sortByPaymentDate),
    }))

    try {
      const updated = await invoke<Subscription>('toggle_subscription_pinned', { id })
      set((state) => ({
        subscriptions: state.subscriptions
          .map((s) => (s.id === id ? updated : s))
          .sort(sortByPaymentDate),
      }))
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to toggle pinned:', error)
      throw error
    }
  },

  transitionStatus: async (id, status) => {
    const previousSubscriptions = get().subscriptions

    set((state) => ({
      subscriptions: state.subscriptions.map((s) => (s.id === id ? { ...s, status } : s)),
    }))

    try {
      const updated = await invoke<Subscription>('transition_subscription_status', {
        id,
        status,
      })
      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.id === id ? updated : s)),
      }))
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to transition status:', error)
      throw error
    }
  },

  cancel: async (id, reason) => {
    const previousSubscriptions = get().subscriptions
    const now = new Date().toISOString()

    // Optimistic update
    set((state) => ({
      subscriptions: state.subscriptions.map((s) =>
        s.id === id
          ? {
              ...s,
              status: 'cancelled' as const,
              is_active: false,
              cancellation_reason: reason || null,
              cancelled_at: now,
            }
          : s
      ),
    }))

    try {
      const updated = await invoke<Subscription>('cancel_subscription', {
        id,
        reason: reason || null,
      })
      set((state) => ({
        subscriptions: state.subscriptions.map((s) => (s.id === id ? updated : s)),
      }))
    } catch (error) {
      set({ subscriptions: previousSubscriptions })
      console.error('Failed to cancel subscription:', error)
      throw error
    }
  },

  markReviewed: async (id) => {
    try {
      const updated = await invoke<Subscription>('mark_subscription_reviewed', { id })
      set((state) => ({
        subscriptions: state.subscriptions
          .map((s) => (s.id === id ? updated : s))
          .sort(sortByPaymentDate),
        needingReview: state.needingReview.filter((s) => s.id !== id),
      }))
    } catch (error) {
      set({ error: String(error) })
      console.error('Failed to mark subscription as reviewed:', error)
      throw error
    }
  },

  fetchNeedingReview: async (days = 30) => {
    try {
      const subs = await invoke<Subscription[]>('list_subscriptions_needing_review', { days })
      set({ needingReview: subs })
    } catch (error) {
      set({ error: String(error) })
      console.error('Failed to fetch subscriptions needing review:', error)
    }
  },
}))
