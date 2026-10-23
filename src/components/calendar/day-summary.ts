import { formatCurrency } from '@/lib/currency'
import type { DayPayment } from '@/hooks/use-calendar-stats'

export interface DaySummary {
  /** Currency the day's headline total is in: the display currency when any payment uses it. */
  currency: string
  /** Sum of the payments billed in `currency` */
  total: number
  /** Payments in other currencies, by code; they are listed but never converted */
  excludedCurrencies: Record<string, number>
  /** "$73.00 + ¥3,200": every currency's own sum, for labels that must not drop any */
  perCurrencyLabel: string
  paidCount: number
  skippedCount: number
}

/**
 * Totals for one calendar day without converting currencies. A day billed only in another
 * currency shows that currency's total instead of a misleading zero in the display currency.
 */
export function summarizeDay(payments: readonly DayPayment[], displayCurrency: string): DaySummary {
  const byCurrency = new Map<string, number>()
  let paidCount = 0
  let skippedCount = 0
  for (const payment of payments) {
    const code = payment.subscription.currency
    byCurrency.set(code, (byCurrency.get(code) ?? 0) + payment.amount)
    if (payment.isPaid) paidCount++
    if (payment.isSkipped) skippedCount++
  }

  const currency =
    byCurrency.has(displayCurrency) || payments.length === 0
      ? displayCurrency
      : payments[0].subscription.currency
  const excludedCurrencies: Record<string, number> = {}
  for (const payment of payments) {
    const code = payment.subscription.currency
    if (code !== currency) excludedCurrencies[code] = (excludedCurrencies[code] ?? 0) + 1
  }

  return {
    currency,
    total: byCurrency.get(currency) ?? 0,
    excludedCurrencies,
    perCurrencyLabel: [...byCurrency]
      .map(([code, amount]) => formatCurrency(amount, code))
      .join(' + '),
    paidCount,
    skippedCount,
  }
}

export const paymentCountLabel = (count: number) => `${count} payment${count === 1 ? '' : 's'}`
