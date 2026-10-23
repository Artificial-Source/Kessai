import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatCompactCurrency,
  getCurrencySymbol,
  getCurrencyOptions,
  CURRENCIES,
} from '../currency'

describe('formatCurrency', () => {
  it('formats USD correctly', () => {
    expect(formatCurrency(1234.56, 'USD')).toBe('$1,234.56')
  })

  it('formats EUR correctly', () => {
    expect(formatCurrency(1234.56, 'EUR')).toMatch(/1[.,]234[.,]56/)
  })

  it('formats GBP correctly', () => {
    expect(formatCurrency(99.99, 'GBP')).toBe('£99.99')
  })

  it('formats JPY using its zero minor units', () => {
    expect(formatCurrency(3200, 'JPY')).toBe('￥3,200')
    expect(formatCurrency(3200.6, 'JPY')).toBe('￥3,201')
  })

  it.each([
    ['KRW', '₩3,200'],
    ['VND', '3.200\u00a0₫'],
    ['CLP', '$3.200'],
  ])('formats %s without fractional minor units', (currency, expected) => {
    expect(formatCurrency(3200, currency)).toBe(expected)
  })

  it('keeps three minor units for currencies that use them', () => {
    expect(formatCurrency(1.234, 'KWD')).toContain('١٫٢٣٤')
  })

  it('defaults to USD when no currency specified', () => {
    expect(formatCurrency(50)).toBe('$50.00')
  })

  it('handles zero', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00')
  })

  it('handles negative numbers', () => {
    expect(formatCurrency(-100, 'USD')).toBe('-$100.00')
  })

  it('falls back for unsupported currency codes', () => {
    expect(formatCurrency(12.34, 'NOT_A_CODE')).toBe('NOT_A_CODE 12.34')
  })
})

describe('formatCompactCurrency', () => {
  it('formats large numbers compactly', () => {
    const result = formatCompactCurrency(1500000, 'USD')
    expect(result).toMatch(/\$1\.5M|\$1,5\sM/)
  })

  it('formats small numbers normally', () => {
    expect(formatCompactCurrency(500, 'USD')).toBe('$500')
  })
})

describe('getCurrencySymbol', () => {
  it('returns correct symbol for USD', () => {
    expect(getCurrencySymbol('USD')).toBe('$')
  })

  it('returns correct symbol for EUR', () => {
    expect(getCurrencySymbol('EUR')).toBe('€')
  })

  it('returns correct symbol for GBP', () => {
    expect(getCurrencySymbol('GBP')).toBe('£')
  })

  it('returns correct symbol for JPY', () => {
    expect(getCurrencySymbol('JPY')).toBe('¥')
  })

  it('returns correct symbol for INR', () => {
    expect(getCurrencySymbol('INR')).toBe('₹')
  })
})

describe('getCurrencyOptions', () => {
  it('returns all currencies as options', () => {
    const options = getCurrencyOptions()
    expect(options).toHaveLength(Object.keys(CURRENCIES).length)
  })

  it('has correct structure for each option', () => {
    const options = getCurrencyOptions()
    options.forEach((option) => {
      expect(option).toHaveProperty('value')
      expect(option).toHaveProperty('label')
      expect(option).toHaveProperty('symbol')
      expect(option).toHaveProperty('name')
      expect(option).toHaveProperty('searchText')
      expect(typeof option.value).toBe('string')
      expect(typeof option.label).toBe('string')
      expect(typeof option.searchText).toBe('string')
    })
  })

  it('includes USD option', () => {
    const options = getCurrencyOptions()
    const usdOption = options.find((o) => o.value === 'USD')
    expect(usdOption).toBeDefined()
    expect(usdOption?.label).toContain('$')
    expect(usdOption?.label).toContain('USD')
  })
})

describe('CURRENCIES constant', () => {
  it('has all expected currencies', () => {
    const expectedCurrencies = [
      'USD',
      'EUR',
      'GBP',
      'MXN',
      'CAD',
      'AUD',
      'NZD',
      'CHF',
      'SEK',
      'NOK',
      'DKK',
      'PLN',
      'JPY',
      'CNY',
      'KRW',
      'SGD',
      'INR',
      'BRL',
      'ARS',
      'CLP',
      'COP',
      'PEN',
      'ZAR',
      'AED',
    ]
    expectedCurrencies.forEach((code) => {
      expect(CURRENCIES).toHaveProperty(code)
    })
  })

  it('each currency has symbol, name, and locale', () => {
    Object.values(CURRENCIES).forEach((currency) => {
      expect(currency).toHaveProperty('symbol')
      expect(currency).toHaveProperty('name')
      expect(currency).toHaveProperty('locale')
    })
  })
})
