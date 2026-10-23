import type { BillingCycle } from '@/types/subscription'

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
  custom: 'Custom',
}

export const BILLING_CYCLE_SHORT: Record<BillingCycle, string> = {
  weekly: '/wk',
  monthly: '/mo',
  quarterly: '/qtr',
  yearly: '/yr',
  custom: '',
}

/** Spoken names for the preset swatch hexes (subscription, category, tag, and card palettes). */
const COLOR_NAMES: Record<string, string> = {
  '#8b5cf6': 'Violet',
  '#3b82f6': 'Blue',
  '#06b6d4': 'Cyan',
  '#14b8a6': 'Teal',
  '#10b981': 'Green',
  '#f59e0b': 'Amber',
  '#f97316': 'Orange',
  '#ef4444': 'Red',
  '#ec4899': 'Pink',
  '#6b7280': 'Gray',
}

/** Accessible name for a swatch: the palette name, or the hex itself for custom colors. */
export function colorName(hex: string): string {
  return COLOR_NAMES[hex.toLowerCase()] ?? hex.toUpperCase()
}
