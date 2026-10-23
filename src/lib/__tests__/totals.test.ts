import { describe, expect, it } from 'vitest'
import { calculateDisplayTotals } from '@/lib/totals'
import type { Subscription } from '@/types/subscription'

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'subscription',
  name: 'Shared subscription',
  amount: 60,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 10,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: '2026-10-10',
  status: 'active',
  shared_count: 6,
  is_pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

describe('calculateDisplayTotals', () => {
  it('uses the one-sixth user share and excludes other currencies without conversion', () => {
    expect(
      calculateDisplayTotals(
        [subscription(), subscription({ id: 'jpy', currency: 'JPY', amount: 600 })],
        'USD'
      )
    ).toEqual({ monthly: 10, yearly: 120, count: 1, excludedCurrencies: { JPY: 1 } })
  })

  it('includes only active billable subscriptions and normalizes each billing cycle', () => {
    const subscriptions = [
      subscription({ amount: 12, shared_count: 1, billing_cycle: 'weekly', status: 'trial' }),
      subscription({
        amount: 90,
        shared_count: 3,
        billing_cycle: 'quarterly',
        status: 'grace_period',
      }),
      subscription({ amount: 120, shared_count: 2, billing_cycle: 'yearly' }),
      subscription({ is_active: false }),
      subscription({ status: 'paused' }),
      subscription({ status: 'pending_cancellation' }),
      subscription({ status: 'cancelled', currency: 'JPY' }),
    ]

    expect(calculateDisplayTotals(subscriptions, 'USD')).toEqual({
      monthly: 67,
      yearly: 804,
      count: 3,
      excludedCurrencies: {},
    })
  })

  it('treats absent and zero legacy sharing counts as one person', () => {
    const legacy = subscription({ amount: 12 })
    Reflect.deleteProperty(legacy, 'shared_count')
    expect(
      calculateDisplayTotals([legacy, subscription({ amount: 8, shared_count: 0 })], 'USD')
    ).toEqual({ monthly: 20, yearly: 240, count: 2, excludedCurrencies: {} })
  })

  it('rounds the final monetary totals to cents', () => {
    expect(
      calculateDisplayTotals(
        [
          subscription({ amount: 0.1, shared_count: 1 }),
          subscription({ amount: 0.2, shared_count: 1 }),
        ],
        'USD'
      )
    ).toEqual({ monthly: 0.3, yearly: 3.6, count: 2, excludedCurrencies: {} })
  })

  it.each([
    ['KWD', 1.2344, 1.234, 14.813],
    ['JPY', 1234.56, 1235, 14815],
  ])('rounds %s totals to its native minor units', (currency, amount, monthly, yearly) => {
    expect(
      calculateDisplayTotals([subscription({ currency, amount, shared_count: 1 })], currency)
    ).toEqual({ monthly, yearly, count: 1, excludedCurrencies: {} })
  })

  it('keeps the two-decimal formatting fallback for invalid legacy currency codes', () => {
    expect(
      calculateDisplayTotals(
        [subscription({ currency: 'invalid', amount: 1.234, shared_count: 1 })],
        'invalid'
      )
    ).toEqual({ monthly: 1.23, yearly: 14.81, count: 1, excludedCurrencies: {} })
  })

  it('returns zero totals for an empty list and zero-value charges', () => {
    expect(calculateDisplayTotals([], 'USD')).toEqual({
      monthly: 0,
      yearly: 0,
      count: 0,
      excludedCurrencies: {},
    })
    expect(calculateDisplayTotals([subscription({ amount: 0 })], 'USD')).toEqual({
      monthly: 0,
      yearly: 0,
      count: 1,
      excludedCurrencies: {},
    })
  })

  it('returns zero totals and counts each excluded currency', () => {
    expect(
      calculateDisplayTotals(
        [
          subscription({ currency: 'EUR' }),
          subscription({ currency: 'EUR' }),
          subscription({ currency: 'JPY' }),
        ],
        'USD'
      )
    ).toEqual({ monthly: 0, yearly: 0, count: 0, excludedCurrencies: { EUR: 2, JPY: 1 } })
  })
})
