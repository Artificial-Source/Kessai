import { useMemo } from 'react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { getUpcomingPayments } from '@/lib/date-utils'
import { calculateDisplayTotals } from '@/lib/totals'
import type { DisplayTotals } from '@/lib/totals'
import { BILLING_CYCLE_MULTIPLIERS, isBillableStatus } from '@/types/subscription'
import type { BillingCycle, Subscription } from '@/types/subscription'

/** Days ahead covered by the dashboard's upcoming payments list. */
const UPCOMING_WINDOW_DAYS = 7

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

/** One as-billed charge per subscription: user share, display currency, not normalized. */
export type AsBilledTotal = {
  amount: number
  count: number
  excludedCurrencies: DisplayTotals['excludedCurrencies']
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
 * Sums each subscription's next charge as billed (user share, display currency only).
 * Each billing cycle is totalled by calculateDisplayTotals, then its yearly amount is
 * divided back into one charge, so billable, share and currency rules live in one place.
 */
export function calculateAsBilledTotal(
  subscriptions: readonly Subscription[],
  displayCurrency: string
): AsBilledTotal {
  const total: AsBilledTotal = { amount: 0, count: 0, excludedCurrencies: {} }
  for (const [cycle, group] of groupBy<BillingCycle>(subscriptions, (s) => s.billing_cycle)) {
    const totals = calculateDisplayTotals(group, displayCurrency)
    total.amount += totals.yearly / BILLING_CYCLE_MULTIPLIERS[cycle]
    total.count += totals.count
    for (const [code, count] of Object.entries(totals.excludedCurrencies)) {
      total.excludedCurrencies[code] = (total.excludedCurrencies[code] ?? 0) + count
    }
  }
  return total
}

/**
 * Hook for computing dashboard statistics from subscriptions.
 *
 * Every total is the user's share of active billable subscriptions in the settings
 * currency; other currencies are counted in the matching `excludedCurrencies` record.
 *
 * @returns Dashboard statistics object
 * @example
 * const { totalMonthly, categorySpending } = useDashboardStats()
 */
export function useDashboardStats() {
  // Use selective subscriptions for better performance
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const categories = useCategoryStore((state) => state.categories)
  const currency = useSettingsStore((state) => state.settings?.currency || 'USD')

  // Listed and counted rows match the subscriptions the totals can include.
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.is_active && isBillableStatus(s.status)),
    [subscriptions]
  )

  const totals = useMemo(
    () => calculateDisplayTotals(subscriptions, currency),
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

  // Separate as-billed totals by billing cycle.
  const monthlySubs = useMemo(
    () =>
      calculateAsBilledTotal(
        subscriptions.filter((sub) => sub.billing_cycle === 'monthly'),
        currency
      ),
    [subscriptions, currency]
  )

  const yearlySubs = useMemo(
    () =>
      calculateAsBilledTotal(
        subscriptions.filter((sub) => sub.billing_cycle === 'yearly'),
        currency
      ),
    [subscriptions, currency]
  )

  // Upcoming rows keep their own currency; the due total is as billed, not normalized.
  const { upcomingPayments, upcomingDue } = useMemo(() => {
    const payments = getUpcomingPayments(activeSubscriptions, UPCOMING_WINDOW_DAYS)
    return { upcomingPayments: payments, upcomingDue: calculateAsBilledTotal(payments, currency) }
  }, [activeSubscriptions, currency])

  return {
    categorySpending,
    totalMonthly: totals.monthly,
    totalYearly: totals.yearly,
    excludedCurrencies: totals.excludedCurrencies,
    activeCount: activeSubscriptions.length,
    totalCount: subscriptions.length,
    // Separate by billing cycle
    monthlySubsTotal: monthlySubs.amount,
    monthlySubsCount: monthlySubs.count,
    monthlySubsExcludedCurrencies: monthlySubs.excludedCurrencies,
    yearlySubsTotal: yearlySubs.amount,
    yearlySubsCount: yearlySubs.count,
    yearlySubsExcludedCurrencies: yearlySubs.excludedCurrencies,
    // Next charges in the upcoming window
    upcomingPayments,
    upcomingTotal: upcomingDue.amount,
    upcomingExcludedCurrencies: upcomingDue.excludedCurrencies,
  }
}
