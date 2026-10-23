import { describe, it, expect } from 'vitest'
import {
  subscriptionSchema,
  subscriptionFormSchema,
  calculateYearlyAmount,
  calculateMonthlyAmount,
  BILLING_CYCLE_MULTIPLIERS,
  SUBSCRIPTION_COLORS,
} from '../subscription'

describe('subscriptionSchema', () => {
  const validSubscription = {
    id: '123',
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: 15,
    category_id: 'cat-1',
    card_id: null,
    color: '#8b5cf6',
    logo_url: null,
    notes: null,
    is_active: true,
    next_payment_date: '2025-02-15',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }

  it('validates a correct subscription', () => {
    const result = subscriptionSchema.safeParse(validSubscription)
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = subscriptionSchema.safeParse({ ...validSubscription, name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = subscriptionSchema.safeParse({ ...validSubscription, amount: -10 })
    expect(result.success).toBe(false)
  })

  it('rejects invalid billing cycle', () => {
    const result = subscriptionSchema.safeParse({ ...validSubscription, billing_cycle: 'biweekly' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid color format', () => {
    const result = subscriptionSchema.safeParse({ ...validSubscription, color: 'red' })
    expect(result.success).toBe(false)
  })

  it('accepts null for optional fields', () => {
    const result = subscriptionSchema.safeParse({
      ...validSubscription,
      billing_day: null,
      category_id: null,
      color: null,
      notes: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('subscriptionFormSchema', () => {
  it('requires next_payment_date', () => {
    const result = subscriptionFormSchema.safeParse({
      name: 'Netflix',
      amount: 15.99,
      currency: 'USD',
      billing_cycle: 'monthly',
      billing_day: null,
      category_id: null,
      color: null,
      notes: null,
      next_payment_date: '',
    })
    expect(result.success).toBe(false)
  })

  const validForm = {
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: null,
    category_id: null,
    color: null,
    notes: null,
    next_payment_date: '2026-11-01',
    is_trial: false,
    shared_count: 1,
    is_pinned: false,
  }

  it('accepts a zero amount for free plans', () => {
    expect(subscriptionFormSchema.safeParse({ ...validForm, amount: 0 }).success).toBe(true)
  })

  it('rejects a negative amount with a plain message', () => {
    const result = subscriptionFormSchema.safeParse({ ...validForm, amount: -1 })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('Amount can’t be negative')
  })

  it.each([undefined, null, ''])('requires an end date for a trial with %s', (trial_end_date) => {
    const result = subscriptionFormSchema.safeParse({
      ...validForm,
      is_trial: true,
      trial_end_date,
    })

    expect(result.success).toBe(false)
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ['trial_end_date'],
        message: 'Enter when the trial ends',
      }),
    ])
  })

  it('accepts a trial with an end date', () => {
    expect(
      subscriptionFormSchema.safeParse({
        ...validForm,
        is_trial: true,
        trial_end_date: '2026-11-15',
      }).success
    ).toBe(true)
  })

  it('does not require a trial end date for a non-trial subscription', () => {
    expect(subscriptionFormSchema.safeParse(validForm).success).toBe(true)
  })
})

describe('calculateYearlyAmount', () => {
  it('calculates weekly to yearly', () => {
    expect(calculateYearlyAmount(10, 'weekly')).toBe(520)
  })

  it('calculates monthly to yearly', () => {
    expect(calculateYearlyAmount(10, 'monthly')).toBe(120)
  })

  it('calculates quarterly to yearly', () => {
    expect(calculateYearlyAmount(30, 'quarterly')).toBe(120)
  })

  it('returns same amount for yearly', () => {
    expect(calculateYearlyAmount(100, 'yearly')).toBe(100)
  })
})

describe('calculateMonthlyAmount', () => {
  it('calculates weekly to monthly', () => {
    const monthly = calculateMonthlyAmount(10, 'weekly')
    expect(monthly).toBeCloseTo(43.33, 1)
  })

  it('returns same amount for monthly', () => {
    expect(calculateMonthlyAmount(15.99, 'monthly')).toBe(15.99)
  })

  it('calculates yearly to monthly', () => {
    const monthly = calculateMonthlyAmount(120, 'yearly')
    expect(monthly).toBe(10)
  })

  it('calculates quarterly to monthly', () => {
    const monthly = calculateMonthlyAmount(30, 'quarterly')
    expect(monthly).toBe(10)
  })
})

describe('BILLING_CYCLE_MULTIPLIERS', () => {
  it('has correct multiplier for each cycle', () => {
    expect(BILLING_CYCLE_MULTIPLIERS.weekly).toBe(52)
    expect(BILLING_CYCLE_MULTIPLIERS.monthly).toBe(12)
    expect(BILLING_CYCLE_MULTIPLIERS.quarterly).toBe(4)
    expect(BILLING_CYCLE_MULTIPLIERS.yearly).toBe(1)
  })
})

describe('SUBSCRIPTION_COLORS', () => {
  it('contains valid hex colors', () => {
    SUBSCRIPTION_COLORS.forEach((color) => {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    })
  })

  it('has at least 5 colors', () => {
    expect(SUBSCRIPTION_COLORS.length).toBeGreaterThanOrEqual(5)
  })
})
