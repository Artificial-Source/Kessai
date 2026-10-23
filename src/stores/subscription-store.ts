import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import { logger } from '@/lib/logger'
import { usePaymentStore } from '@/stores/payment-store'
import {
  compareSubscriptionDisplayPriority,
  type Subscription,
  type NewSubscription,
  type SubscriptionStatus,
} from '@/types/subscription'

type SubscriptionState = {
  subscriptions: Subscription[]
  needingReview: Subscription[]
  isLoading: boolean
  error: string | null
  // The two refresh queries share a store, but must report failures independently.
  fetchError: string | null
  reviewError: string | null
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
  const priority = compareSubscriptionDisplayPriority(a, b)
  if (priority !== 0) return priority
  if (!a.next_payment_date && !b.next_payment_date) return 0
  if (!a.next_payment_date) return 1
  if (!b.next_payment_date) return -1
  return new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime()
}

export const useSubscriptionStore = create<SubscriptionState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let reviewRequest = 0
  let pending = 0
  type Mutation = {
    data: Partial<Subscription> | null
    settled: boolean
    failed: boolean
    result?: Subscription
  }
  const mutations = new Map<string, { base: Subscription | undefined; entries: Mutation[] }>()
  const mutate = async (
    id: string,
    data: Partial<Subscription> | null,
    request: () => Promise<Subscription | void>
  ) => {
    const journal = mutations.get(id) ?? {
      base: get().subscriptions.find((s) => s.id === id),
      entries: [],
    }
    const mutation: Mutation = { data, settled: false, failed: false }
    journal.entries.push(mutation)
    mutations.set(id, journal)
    generation++
    pending++
    const publish = () => {
      let subscription = journal.base
      for (const entry of journal.entries) {
        if (entry.failed) continue
        subscription = entry.settled
          ? entry.result
          : entry.data === null
            ? undefined
            : subscription
              ? { ...subscription, ...entry.data }
              : undefined
      }
      const reconciled = subscription
      set((state) => ({
        subscriptions: [
          ...state.subscriptions.filter((s) => s.id !== id),
          ...(reconciled ? [reconciled] : []),
        ].sort(sortByPaymentDate),
        needingReview: reconciled?.last_reviewed_at
          ? state.needingReview.filter((s) => s.id !== id)
          : state.needingReview,
      }))
    }
    publish()
    try {
      mutation.result = (await request()) || undefined
    } catch (error) {
      mutation.failed = true
      set({ error: String(error) })
      logger.error('store:subscriptions', 'mutation failed', error)
      throw error
    } finally {
      mutation.settled = true
      publish()
      pending--
      generation++
      usePaymentStore.getState().invalidateCalendar()
      if (journal.entries.every((entry) => entry.settled)) mutations.delete(id)
    }
  }

  return {
    subscriptions: [],
    needingReview: [],
    isLoading: false,
    error: null,
    fetchError: null,
    reviewError: null,
    fetch: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = pending === 0
      set({ isLoading: true, error: null, fetchError: null })
      try {
        const subscriptions = await invoke('list_subscriptions')
        if (request === fetchRequest && started === generation && canPublish) set({ subscriptions })
      } catch (error) {
        if (request === fetchRequest) set({ error: String(error), fetchError: String(error) })
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },
    add: async (sub) => {
      const optimisticId = crypto.randomUUID()
      const now = new Date().toISOString()
      const optimistic: Subscription = {
        ...sub,
        id: optimisticId,
        created_at: now,
        updated_at: now,
        last_reviewed_at: null,
        status_changed_at: now,
      }
      generation++
      pending++
      set((state) => ({
        subscriptions: [...state.subscriptions, optimistic].sort(sortByPaymentDate),
      }))
      try {
        const created = await invoke('create_subscription', { data: sub })
        set((state) => ({
          subscriptions: state.subscriptions
            .map((s) => (s.id === optimisticId ? created : s))
            .sort(sortByPaymentDate),
        }))
        return created
      } catch (error) {
        set((state) => ({
          subscriptions: state.subscriptions.filter((s) => s.id !== optimisticId),
          error: String(error),
        }))
        throw error
      } finally {
        pending--
        generation++
        usePaymentStore.getState().invalidateCalendar()
      }
    },
    update: async (id, data) => {
      if (!get().subscriptions.some((s) => s.id === id)) return
      await mutate(id, { ...data, updated_at: new Date().toISOString() }, () =>
        invoke('update_subscription', { id, data })
      )
    },
    remove: (id) => mutate(id, null, () => invoke('delete_subscription', { id })),
    toggleActive: async (id) => {
      const sub = get().subscriptions.find((s) => s.id === id)
      if (!sub) return
      await mutate(id, { is_active: !sub.is_active }, () =>
        invoke('toggle_subscription_active', { id })
      )
    },
    togglePinned: async (id) => {
      const sub = get().subscriptions.find((s) => s.id === id)
      if (!sub) return
      await mutate(id, { is_pinned: !sub.is_pinned }, () =>
        invoke('toggle_subscription_pinned', { id })
      )
    },
    transitionStatus: (id, status) =>
      mutate(id, { status }, () => invoke('transition_subscription_status', { id, status })),
    cancel: (id, reason) =>
      mutate(
        id,
        {
          status: 'cancelled',
          is_active: false,
          cancellation_reason: reason || null,
          cancelled_at: new Date().toISOString(),
        },
        () => invoke('cancel_subscription', { id, reason: reason || null })
      ),
    markReviewed: (id) => mutate(id, {}, () => invoke('mark_subscription_reviewed', { id })),
    fetchNeedingReview: async (days = 30) => {
      const request = ++reviewRequest
      const started = generation
      const canPublish = pending === 0
      set({ reviewError: null })
      try {
        const needingReview = await invoke('list_subscriptions_needing_review', { days })
        if (request === reviewRequest && started === generation && canPublish)
          set({ needingReview })
      } catch (error) {
        if (request === reviewRequest) set({ error: String(error), reviewError: String(error) })
      }
    },
  }
})
