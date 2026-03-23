import { describe, it, expect } from 'vitest'
import { BILLING_CYCLE_LABELS, BILLING_CYCLE_SHORT, CATEGORY_BADGE_VARIANTS } from '../constants'

describe('BILLING_CYCLE_LABELS', () => {
  it('has all expected billing cycle keys', () => {
    const expectedKeys = ['weekly', 'monthly', 'quarterly', 'yearly', 'custom']
    expect(Object.keys(BILLING_CYCLE_LABELS).sort()).toEqual(expectedKeys.sort())
  })

  it('has human-readable label values', () => {
    expect(BILLING_CYCLE_LABELS.weekly).toBe('Weekly')
    expect(BILLING_CYCLE_LABELS.monthly).toBe('Monthly')
    expect(BILLING_CYCLE_LABELS.quarterly).toBe('Quarterly')
    expect(BILLING_CYCLE_LABELS.yearly).toBe('Yearly')
    expect(BILLING_CYCLE_LABELS.custom).toBe('Custom')
  })

  it('all values are non-empty strings', () => {
    Object.values(BILLING_CYCLE_LABELS).forEach((label) => {
      expect(typeof label).toBe('string')
      expect(label.length).toBeGreaterThan(0)
    })
  })
})

describe('BILLING_CYCLE_SHORT', () => {
  it('has the same keys as BILLING_CYCLE_LABELS', () => {
    expect(Object.keys(BILLING_CYCLE_SHORT).sort()).toEqual(
      Object.keys(BILLING_CYCLE_LABELS).sort()
    )
  })

  it('has correct short labels', () => {
    expect(BILLING_CYCLE_SHORT.weekly).toBe('/wk')
    expect(BILLING_CYCLE_SHORT.monthly).toBe('/mo')
    expect(BILLING_CYCLE_SHORT.quarterly).toBe('/qtr')
    expect(BILLING_CYCLE_SHORT.yearly).toBe('/yr')
    expect(BILLING_CYCLE_SHORT.custom).toBe('')
  })
})

describe('CATEGORY_BADGE_VARIANTS', () => {
  it('maps all default categories', () => {
    const expectedCategories = [
      'Entertainment',
      'Software',
      'Music',
      'Health',
      'Shopping',
      'AI',
      'Cloud',
      'Productivity',
      'Development',
      'Security',
    ]
    expectedCategories.forEach((category) => {
      expect(CATEGORY_BADGE_VARIANTS).toHaveProperty(category)
    })
  })

  it('has lowercase variant values', () => {
    Object.values(CATEGORY_BADGE_VARIANTS).forEach((variant) => {
      expect(variant).toBe(variant.toLowerCase())
    })
  })

  it('variant values are non-empty strings', () => {
    Object.values(CATEGORY_BADGE_VARIANTS).forEach((variant) => {
      expect(typeof variant).toBe('string')
      expect(variant.length).toBeGreaterThan(0)
    })
  })
})
