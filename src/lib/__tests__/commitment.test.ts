import { describe, expect, it } from 'vitest'
import {
  compareToTarget,
  figureSizeClass,
  listCurrencies,
  targetVarianceLabel,
} from '../commitment'
import { formatCurrency } from '../currency'

describe('compareToTarget and targetVarianceLabel', () => {
  it('states the exact amount above the target', () => {
    const comparison = compareToTarget(330.53, 250, 'USD')
    expect(comparison).toMatchObject({ state: 'above', variance: 80.53 })
    expect(Math.round(comparison.percent)).toBe(132)
    expect(targetVarianceLabel(comparison, 'USD')).toBe('$80.53 above target')
  })

  it('calls an exact match "At target", not over', () => {
    const comparison = compareToTarget(250, 250, 'USD')
    expect(comparison.state).toBe('at')
    expect(targetVarianceLabel(comparison, 'USD')).toBe('At target')
  })

  it('compares in minor units, so a sum that rounds to the target is at it', () => {
    expect(compareToTarget(249.996, 250, 'USD').state).toBe('at')
    expect(compareToTarget(250.004, 250, 'USD').state).toBe('at')
    expect(compareToTarget(250.01, 250, 'USD').state).toBe('above')
  })

  it('states the amount below the target without alarm', () => {
    const comparison = compareToTarget(187.6, 200, 'USD')
    expect(comparison).toMatchObject({ state: 'below', variance: 12.4 })
    expect(targetVarianceLabel(comparison, 'USD')).toBe('$12.40 below target')
  })

  it('uses the currency’s own minor units', () => {
    const comparison = compareToTarget(30500.4, 30000, 'JPY')
    expect(comparison.variance).toBe(500)
    expect(targetVarianceLabel(comparison, 'JPY')).toBe(
      `${formatCurrency(500, 'JPY')} above target`
    )
  })
})

describe('figureSizeClass', () => {
  it('steps the summary figure down as the formatted amount gets longer', () => {
    expect(figureSizeClass('$330.53')).toBe('text-[1.875rem] sm:text-4xl')
    expect(figureSizeClass('$12,345,678.90')).toBe('text-2xl sm:text-[1.875rem]')
    expect(figureSizeClass('1.234.567.890,12 €')).toBe('text-xl sm:text-2xl')
  })
})

describe('listCurrencies', () => {
  it('joins codes in reading order', () => {
    expect(listCurrencies({})).toBe('')
    expect(listCurrencies({ EUR: 1 })).toBe('EUR')
    expect(listCurrencies({ JPY: 1, EUR: 2 })).toBe('EUR and JPY')
    expect(listCurrencies({ JPY: 1, EUR: 2, GBP: 1, CHF: 0 })).toBe('EUR, GBP and JPY')
  })
})
