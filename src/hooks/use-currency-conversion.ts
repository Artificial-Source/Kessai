import { useEffect, useMemo, useCallback, useState } from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { preloadRates, convertCurrencyCached, convertCurrency } from '@/lib/exchange-rates'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'

/**
 * Hook that provides currency conversion utilities.
 * Preloads exchange rates on mount and provides sync/async conversion.
 *
 * @returns Conversion helpers and the display currency
 */
export function useCurrencyConversion() {
  const settings = useSettingsStore((s) => s.settings)
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const [ratesReady, setRatesReady] = useState(false)

  const displayCurrency = (settings?.currency || 'USD') as CurrencyCode

  // Collect unique currencies used across subscriptions
  const usedCurrencies = useMemo(() => {
    const currencies = new Set<CurrencyCode>()
    currencies.add(displayCurrency)
    for (const sub of subscriptions) {
      if (sub.currency) {
        currencies.add(sub.currency as CurrencyCode)
      }
    }
    return [...currencies]
  }, [subscriptions, displayCurrency])

  // Preload rates for all used currencies
  useEffect(() => {
    preloadRates(usedCurrencies).then(() => setRatesReady(true))
  }, [usedCurrencies])

  /**
   * Get the effective currency for a subscription.
   * Falls back to global display currency if subscription has no currency set.
   */
  const getEffectiveCurrency = useCallback(
    (sub: Subscription): CurrencyCode => {
      return (sub.currency || displayCurrency) as CurrencyCode
    },
    [displayCurrency]
  )

  /**
   * Convert a subscription amount to the display currency (sync, cached).
   * Returns the original amount if no rate is cached.
   */
  const convertToDisplay = useCallback(
    (amount: number, fromCurrency: CurrencyCode): number => {
      const result = convertCurrencyCached(amount, fromCurrency, displayCurrency)
      return result ?? amount
    },
    [displayCurrency]
  )

  /**
   * Convert a subscription's amount to the display currency (sync, cached).
   */
  const convertSubToDisplay = useCallback(
    (sub: Subscription): number => {
      const subCurrency = getEffectiveCurrency(sub)
      return convertToDisplay(sub.amount, subCurrency)
    },
    [getEffectiveCurrency, convertToDisplay]
  )

  /**
   * Async conversion that fetches rates if needed.
   */
  const convertToDisplayAsync = useCallback(
    async (amount: number, fromCurrency: CurrencyCode): Promise<number> => {
      return convertCurrency(amount, fromCurrency, displayCurrency)
    },
    [displayCurrency]
  )

  /**
   * Check if a subscription uses a different currency than the display currency.
   */
  const hasDifferentCurrency = useCallback(
    (sub: Subscription): boolean => {
      const subCurrency = getEffectiveCurrency(sub)
      return subCurrency !== displayCurrency
    },
    [getEffectiveCurrency, displayCurrency]
  )

  return {
    displayCurrency,
    ratesReady,
    getEffectiveCurrency,
    convertToDisplay,
    convertSubToDisplay,
    convertToDisplayAsync,
    hasDifferentCurrency,
  }
}
