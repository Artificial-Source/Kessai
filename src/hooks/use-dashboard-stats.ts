import { useMemo } from 'react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { calculateMonthlyAmount } from '@/types/subscription'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'

dayjs.extend(isBetween)

/**
 * Convert a subscription amount to display currency, falling back to original amount.
 */
function toDisplayAmount(sub: Subscription, displayCurrency: CurrencyCode): number {
  const subCurrency = (sub.currency || displayCurrency) as CurrencyCode
  if (subCurrency === displayCurrency) return sub.amount
  const converted = convertCurrencyCached(sub.amount, subCurrency, displayCurrency)
  return converted ?? sub.amount
}

/**
 * Spending data aggregated by category.
 * Used for the donut chart breakdown.
 */
export type CategorySpending = {
  /** Category ID or 'uncategorized' */
  id: string
  /** Display name of the category */
  name: string
  /** Hex color for the category */
  color: string
  /** Total monthly amount for this category */
  amount: number
  /** Percentage of total spending (0-100) */
  percentage: number
}

/**
 * Monthly spending data point for trend charts.
 */
export type MonthlySpending = {
  /** Month identifier in yyyy-MM format */
  month: string
  /** Short month label (e.g., "Jan", "Feb") */
  monthLabel: string
  /** Total spending for the month */
  amount: number
}

/**
 * Hook for computing dashboard statistics from subscriptions.
 * Calculates category breakdowns, monthly trends, and totals.
 *
 * All calculations are memoized for performance.
 *
 * @returns Dashboard statistics object
 * @example
 * const { totalMonthly, categorySpending } = useDashboardStats()
 */
export function useDashboardStats() {
  // Use selective subscriptions for better performance
  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const categories = useCategoryStore((state) => state.categories)
  const displayCurrency = (useSettingsStore((s) => s.settings)?.currency || 'USD') as CurrencyCode

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.is_active),
    [subscriptions]
  )

  const categorySpending = useMemo((): CategorySpending[] => {
    const spending: Record<string, { amount: number; name: string; color: string }> = {}

    activeSubscriptions.forEach((sub) => {
      const convertedAmount = toDisplayAmount(sub, displayCurrency)
      const monthlyAmount = calculateMonthlyAmount(convertedAmount, sub.billing_cycle)
      const category = categories.find((c) => c.id === sub.category_id)

      const key = sub.category_id || 'uncategorized'
      const name = category?.name || 'Uncategorized'
      const color = category?.color || '#6b7280'

      if (!spending[key]) {
        spending[key] = { amount: 0, name, color }
      }
      spending[key].amount += monthlyAmount
    })

    const total = Object.values(spending).reduce((sum, s) => sum + s.amount, 0)

    return Object.entries(spending)
      .map(([id, data]) => ({
        id,
        name: data.name,
        color: data.color,
        amount: data.amount,
        percentage: total > 0 ? (data.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount)
  }, [activeSubscriptions, categories, displayCurrency])

  const monthlySpending = useMemo((): MonthlySpending[] => {
    const now = dayjs()
    const months: MonthlySpending[] = []

    // Calculate current monthly total from active subscriptions (converted)
    const currentMonthlyTotal = activeSubscriptions.reduce(
      (sum, sub) =>
        sum + calculateMonthlyAmount(toDisplayAmount(sub, displayCurrency), sub.billing_cycle),
      0
    )

    // Generate 6 months of data
    // Since we don't track historical subscription changes,
    // we show the projected monthly spending based on current subscriptions
    for (let i = 5; i >= 0; i--) {
      const monthDate = now.subtract(i, 'month')

      months.push({
        month: monthDate.format('YYYY-MM'),
        monthLabel: monthDate.format('MMM'),
        amount: Math.round(currentMonthlyTotal * 100) / 100,
      })
    }

    return months
  }, [activeSubscriptions, displayCurrency])

  // Total of ALL subscriptions normalized to monthly (converted to display currency)
  const totalMonthly = useMemo(
    () =>
      activeSubscriptions.reduce(
        (sum, sub) =>
          sum + calculateMonthlyAmount(toDisplayAmount(sub, displayCurrency), sub.billing_cycle),
        0
      ),
    [activeSubscriptions, displayCurrency]
  )

  const totalYearly = useMemo(() => totalMonthly * 12, [totalMonthly])

  // Separate totals by billing cycle (converted to display currency)
  const monthlySubsTotal = useMemo(
    () =>
      activeSubscriptions
        .filter((sub) => sub.billing_cycle === 'monthly')
        .reduce((sum, sub) => sum + toDisplayAmount(sub, displayCurrency), 0),
    [activeSubscriptions, displayCurrency]
  )

  const yearlySubsTotal = useMemo(
    () =>
      activeSubscriptions
        .filter((sub) => sub.billing_cycle === 'yearly')
        .reduce((sum, sub) => sum + toDisplayAmount(sub, displayCurrency), 0),
    [activeSubscriptions, displayCurrency]
  )

  const weeklySubsTotal = useMemo(
    () =>
      activeSubscriptions
        .filter((sub) => sub.billing_cycle === 'weekly')
        .reduce((sum, sub) => sum + toDisplayAmount(sub, displayCurrency), 0),
    [activeSubscriptions, displayCurrency]
  )

  const quarterlySubsTotal = useMemo(
    () =>
      activeSubscriptions
        .filter((sub) => sub.billing_cycle === 'quarterly')
        .reduce((sum, sub) => sum + toDisplayAmount(sub, displayCurrency), 0),
    [activeSubscriptions, displayCurrency]
  )

  // Counts by billing cycle
  const monthlySubsCount = useMemo(
    () => activeSubscriptions.filter((sub) => sub.billing_cycle === 'monthly').length,
    [activeSubscriptions]
  )

  const yearlySubsCount = useMemo(
    () => activeSubscriptions.filter((sub) => sub.billing_cycle === 'yearly').length,
    [activeSubscriptions]
  )

  const averagePerSubscription = useMemo(
    () => (activeSubscriptions.length > 0 ? totalMonthly / activeSubscriptions.length : 0),
    [totalMonthly, activeSubscriptions.length]
  )

  return {
    categorySpending,
    monthlySpending,
    totalMonthly,
    totalYearly,
    averagePerSubscription,
    activeCount: activeSubscriptions.length,
    totalCount: subscriptions.length,
    // Separate by billing cycle
    monthlySubsTotal,
    yearlySubsTotal,
    weeklySubsTotal,
    quarterlySubsTotal,
    monthlySubsCount,
    yearlySubsCount,
  }
}
