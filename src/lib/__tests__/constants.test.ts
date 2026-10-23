import { describe, it, expect } from 'vitest'
import { BILLING_CYCLE_LABELS, BILLING_CYCLE_SHORT, colorName } from '../constants'
import { SUBSCRIPTION_COLORS } from '@/types/subscription'
import { DEFAULT_CATEGORY_COLORS } from '@/types/category'
import { TAG_COLORS } from '@/types/tag'
import { CARD_COLORS } from '@/types/payment-card'

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

describe('colorName', () => {
  it('names every preset swatch in every palette', () => {
    const palettes = [SUBSCRIPTION_COLORS, DEFAULT_CATEGORY_COLORS, TAG_COLORS, CARD_COLORS]
    for (const hex of palettes.flat()) {
      expect(colorName(hex)).toMatch(/^[A-Z][a-z]+$/)
    }
  })

  it('is case-insensitive and falls back to the hex for custom colors', () => {
    expect(colorName('#8B5CF6')).toBe('Violet')
    expect(colorName('#123abc')).toBe('#123ABC')
  })
})
