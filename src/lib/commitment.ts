import { formatCurrency } from '@/lib/currency'
import { roundToCurrencyUnits } from '@/lib/totals'

export type TargetState = 'above' | 'at' | 'below'

export type TargetComparison = {
  state: TargetState
  /** Absolute distance from the target, in the currency's minor units. */
  variance: number
  /** Commitment as a share of the target (132 for 32% above). */
  percent: number
}

/**
 * Compares the monthly-equivalent commitment with the optional monthly target. Both are
 * rounded to minor units first, so a commitment that rounds to the target is "at" it.
 */
export function compareToTarget(
  commitment: number,
  target: number,
  currency: string
): TargetComparison {
  const committed = roundToCurrencyUnits(commitment, currency)
  const goal = roundToCurrencyUnits(target, currency)
  const variance = roundToCurrencyUnits(Math.abs(committed - goal), currency)
  return {
    state: variance === 0 ? 'at' : committed > goal ? 'above' : 'below',
    variance,
    percent: goal > 0 ? (committed / goal) * 100 : 0,
  }
}

/** "$80.53 above target", "At target", "$12.40 below target". */
export function targetVarianceLabel(comparison: TargetComparison, currency: string): string {
  if (comparison.state === 'at') return 'At target'
  return `${formatCurrency(comparison.variance, currency)} ${comparison.state} target`
}

/**
 * Size steps for the summary figure: long amounts step down before they would wrap, so a
 * number never breaks across lines on a 390px phone.
 */
export function figureSizeClass(text: string): string {
  if (text.length <= 12) return 'text-[1.875rem] sm:text-4xl'
  if (text.length <= 16) return 'text-2xl sm:text-[1.875rem]'
  return 'text-xl sm:text-2xl'
}

/** "EUR", "EUR and JPY", "EUR, GBP and JPY". */
export function listCurrencies(excludedCurrencies: Record<string, number>): string {
  const codes = Object.keys(excludedCurrencies)
    .filter((code) => excludedCurrencies[code] > 0)
    .sort()
  return codes.length <= 1
    ? (codes[0] ?? '')
    : `${codes.slice(0, -1).join(', ')} and ${codes[codes.length - 1]}`
}

/** Sum of the counts in an excluded-currencies record. */
export function excludedCount(excludedCurrencies: Record<string, number>): number {
  return Object.values(excludedCurrencies).reduce((sum, count) => sum + count, 0)
}

/** "1 charge", "3 charges". */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`
}
