import {
  calculateUserMonthlyAmount,
  calculateUserYearlyAmount,
  isBillableStatus,
} from '@/types/subscription'
import type { Subscription } from '@/types/subscription'

export interface DisplayTotals {
  monthly: number
  yearly: number
  count: number
  excludedCurrencies: Record<string, number>
}

/**
 * User-share totals in the display currency, rounded to its minor units after summing.
 * Legacy missing/zero sharing counts mean one person. Entered charges stay unchanged.
 */
export function calculateDisplayTotals(
  subscriptions: readonly Subscription[],
  displayCurrency: string
): DisplayTotals {
  const totals: DisplayTotals = {
    monthly: 0,
    yearly: 0,
    count: 0,
    excludedCurrencies: {},
  }

  for (const subscription of subscriptions) {
    if (!subscription.is_active || !isBillableStatus(subscription.status)) continue
    if (subscription.currency !== displayCurrency) {
      totals.excludedCurrencies[subscription.currency] =
        (totals.excludedCurrencies[subscription.currency] ?? 0) + 1
      continue
    }
    totals.monthly += calculateUserMonthlyAmount(
      subscription.amount,
      subscription.billing_cycle,
      subscription.shared_count
    )
    totals.yearly += calculateUserYearlyAmount(
      subscription.amount,
      subscription.billing_cycle,
      subscription.shared_count
    )
    totals.count++
  }

  totals.monthly = roundToCurrencyUnits(totals.monthly, displayCurrency)
  totals.yearly = roundToCurrencyUnits(totals.yearly, displayCurrency)
  return totals
}

/** Rounds a summed amount to the currency's minor units (2 for USD, 0 for JPY). */
export function roundToCurrencyUnits(amount: number, currency: string): number {
  let fractionDigits = 2
  try {
    fractionDigits =
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
      }).resolvedOptions().maximumFractionDigits ?? 2
  } catch {
    // Match formatCurrency's two-decimal fallback for invalid legacy currency codes.
  }
  const scale = 10 ** fractionDigits
  return Math.round((amount + Number.EPSILON) * scale) / scale
}

/** "Excludes 2 in EUR, JPY": what a display-currency total leaves out, or null when nothing is. */
export function excludedCurrenciesNote(
  excludedCurrencies: DisplayTotals['excludedCurrencies']
): string | null {
  const codes = Object.keys(excludedCurrencies)
    .filter((code) => excludedCurrencies[code] > 0)
    .sort()
  const count = codes.reduce((sum, code) => sum + excludedCurrencies[code], 0)
  return count > 0 ? `Excludes ${count} in ${codes.join(', ')}` : null
}
