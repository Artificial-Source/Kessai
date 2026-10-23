import { useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { calculateDisplayTotals } from '@/lib/totals'
import type { Subscription } from '@/types/subscription'

export function useSubscriptions() {
  // Use selective subscriptions for better performance
  const {
    subscriptions,
    isLoading,
    error,
    fetch,
    add,
    update,
    remove,
    toggleActive,
    togglePinned,
    cancel,
  } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      add: state.add,
      update: state.update,
      remove: state.remove,
      toggleActive: state.toggleActive,
      togglePinned: state.togglePinned,
      cancel: state.cancel,
    }))
  )

  const { categories, fetch: fetchCategories } = useCategoryStore(
    useShallow((state) => ({
      categories: state.categories,
      fetch: state.fetch,
    }))
  )
  const currency = useSettingsStore((state) => state.settings?.currency || 'USD')

  useEffect(() => {
    fetch()
    fetchCategories()
  }, [fetch, fetchCategories])

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.is_active),
    [subscriptions]
  )

  // User share of active billable subscriptions in the settings currency.
  const totals = useMemo(
    () => calculateDisplayTotals(subscriptions, currency),
    [subscriptions, currency]
  )

  const getCategory = useCallback(
    (categoryId: string | null) => categories.find((c) => c.id === categoryId),
    [categories]
  )

  const getSubscriptionWithCategory = useCallback(
    (sub: Subscription) => ({
      ...sub,
      category: getCategory(sub.category_id),
    }),
    [getCategory]
  )

  return {
    subscriptions,
    activeSubscriptions,
    isLoading,
    error,
    totalMonthly: totals.monthly,
    totalYearly: totals.yearly,
    excludedCurrencies: totals.excludedCurrencies,
    add,
    update,
    remove,
    toggleActive,
    togglePinned,
    cancel,
    getCategory,
    getSubscriptionWithCategory,
    refresh: fetch,
  }
}
