import { useMemo } from 'react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { calculateDisplayTotals } from '@/lib/totals'
import type { Subscription } from '@/types/subscription'

/**
 * Spending data aggregated by category.
 * Used for the category breakdown.
 */
export type CategorySpending = {
  /** Category ID or 'uncategorized' */
  id: string
  /** Display name of the category */
  name: string
  /** Hex color for the category */
  color: string
  /** Monthly user share in the display currency */
  amount: number
  /** Percentage of total spending (0-100) */
  percentage: number
}

function groupBy<K>(
  subscriptions: readonly Subscription[],
  keyOf: (subscription: Subscription) => K
): Map<K, Subscription[]> {
  const groups = new Map<K, Subscription[]>()
  for (const subscription of subscriptions) {
    const key = keyOf(subscription)
    const group = groups.get(key)
    if (group) group.push(subscription)
    else groups.set(key, [subscription])
  }
  return groups
}

/**
 * The dashboard's commitment figures: monthly and yearly equivalents of the user's share of
 * active billable subscriptions in the settings currency, and the same split by category.
 * Other currencies are counted in `excludedCurrencies`, never converted. These are
 * normalized commitments, not payments: see `useRenewalLedger` for scheduled charges.
 *
 * @example
 * const { totalMonthly, categorySpending } = useDashboardStats()
 */
export function useDashboardStats() {
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const categories = useCategoryStore((state) => state.categories)
  const currency = useSettingsStore((state) => state.settings?.currency || 'USD')

  const totals = useMemo(
    () => calculateDisplayTotals(subscriptions, currency),
    [subscriptions, currency]
  )

  const trialCount = useMemo(
    () =>
      subscriptions.filter((s) => s.is_active && s.status === 'trial' && s.currency === currency)
        .length,
    [subscriptions, currency]
  )

  const categorySpending = useMemo((): CategorySpending[] => {
    const categoryById = new Map(categories.map((category) => [category.id, category]))
    const spending: Omit<CategorySpending, 'percentage'>[] = []

    for (const [categoryId, group] of groupBy(subscriptions, (s) => s.category_id)) {
      const { monthly, count } = calculateDisplayTotals(group, currency)
      if (count === 0) continue
      const category = categoryId ? categoryById.get(categoryId) : undefined
      spending.push({
        id: categoryId || 'uncategorized',
        name: category?.name || 'Uncategorized',
        color: category?.color || '#6b7280',
        amount: monthly,
      })
    }

    const total = spending.reduce((sum, s) => sum + s.amount, 0)

    return spending
      .map((entry) => ({
        ...entry,
        percentage: total > 0 ? (entry.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [subscriptions, categories, currency])

  return {
    categorySpending,
    totalMonthly: totals.monthly,
    totalYearly: totals.yearly,
    excludedCurrencies: totals.excludedCurrencies,
    /** Billable subscriptions counted in the totals (display currency only). */
    countedCount: totals.count,
    /** Of `countedCount`, trials: their recorded price is part of the totals. */
    trialCount,
    totalCount: subscriptions.length,
  }
}
