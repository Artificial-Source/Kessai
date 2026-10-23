import { useCategoryStore } from '@/stores/category-store'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { usePaymentStore } from '@/stores/payment-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useTagStore } from '@/stores/tag-store'

export class AppDataRefreshError extends Error {
  constructor(public readonly errors: Error[]) {
    super(`Failed to refresh app data: ${errors.map((error) => error.message).join('; ')}`)
    this.name = 'AppDataRefreshError'
  }
}

/** Refresh every restored domain; tag links are read on demand rather than cached in a store. */
export async function refreshAppData(): Promise<void> {
  const domains = [
    {
      name: 'settings',
      read: () => useSettingsStore.getState(),
      fetch: () => useSettingsStore.getState().fetch(),
    },
    {
      name: 'subscriptions',
      read: () => ({ error: useSubscriptionStore.getState().fetchError }),
      fetch: () => useSubscriptionStore.getState().fetch(),
    },
    {
      name: 'subscription reviews',
      read: () => ({ error: useSubscriptionStore.getState().reviewError }),
      fetch: () => useSubscriptionStore.getState().fetchNeedingReview(),
    },
    {
      name: 'categories',
      read: () => useCategoryStore.getState(),
      fetch: () => useCategoryStore.getState().fetch(),
    },
    {
      name: 'payment cards',
      read: () => usePaymentCardStore.getState(),
      fetch: () => usePaymentCardStore.getState().fetch(),
    },
    {
      name: 'tags',
      read: () => useTagStore.getState(),
      fetch: () => useTagStore.getState().fetch(),
    },
    {
      name: 'payments',
      read: () => usePaymentStore.getState(),
      fetch: () => usePaymentStore.getState().fetchPayments(),
    },
  ]
  const results = await Promise.allSettled(
    domains.map(async (domain) => {
      await domain.fetch()
      const error = domain.read().error
      if (error) throw new Error(error)
    })
  )
  const errors = results.flatMap((result, index) =>
    result.status === 'rejected'
      ? [new Error(`${domains[index].name}: ${String(result.reason)}`)]
      : []
  )
  if (errors.length > 0) throw new AppDataRefreshError(errors)
}
