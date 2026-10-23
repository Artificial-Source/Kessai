import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  calculateNextPaymentDate,
  formatPaymentDate,
  formatShortDate,
  getDaysUntil,
  getUpcomingPayments,
} from '../date-utils'
import dayjs from 'dayjs'

describe('calculateNextPaymentDate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calculates next weekly payment', () => {
    const startDate = new Date(2025, 0, 1)
    const nextDate = calculateNextPaymentDate(startDate, 'weekly')
    expect(nextDate.getTime()).toBeGreaterThan(new Date(2025, 0, 15).getTime())
  })

  it('calculates next monthly payment', () => {
    const startDate = new Date(2024, 11, 20)
    const nextDate = calculateNextPaymentDate(startDate, 'monthly')
    expect(nextDate.getDate()).toBe(20)
    expect(nextDate.getMonth()).toBe(0)
  })

  it('calculates next quarterly payment', () => {
    const startDate = new Date(2024, 9, 1)
    const nextDate = calculateNextPaymentDate(startDate, 'quarterly')
    expect(nextDate >= new Date(2025, 0, 15)).toBe(true)
  })

  it('calculates next yearly payment', () => {
    const startDate = new Date(2024, 5, 1)
    const nextDate = calculateNextPaymentDate(startDate, 'yearly')
    expect(nextDate.getFullYear()).toBe(2025)
  })

  it('handles billing day for monthly cycle', () => {
    const startDate = new Date(2024, 11, 15)
    const nextDate = calculateNextPaymentDate(startDate, 'monthly', 25)
    expect(nextDate.getDate()).toBe(25)
  })

  it.each([
    ['2025-01-31', '2025-02-01', 'monthly', undefined, '2025-02-28'],
    ['2025-01-31', '2025-02-28', 'monthly', undefined, '2025-03-31'],
    ['2024-01-31', '2024-02-29', 'monthly', undefined, '2024-03-31'],
    ['2024-02-29', '2025-03-01', 'yearly', undefined, '2026-02-28'],
    ['2024-02-29', '2028-02-28', 'yearly', undefined, '2028-02-29'],
    ['2025-12-31', '2025-12-31', 'monthly', undefined, '2026-01-31'],
    ['2026-01-10', '2026-04-11', 'quarterly', 31, '2026-04-30'],
    ['2025-01-10', '2026-01-11', 'yearly', 20, '2026-01-20'],
    ['2025-01-31', '2025-02-28', 'custom', undefined, '2025-03-31'],
    ['2025-01-10', '2025-02-11', 'custom', 25, '2025-02-25'],
    ['2026-03-07', '2026-03-08', 'weekly', 31, '2026-03-14'],
  ] as const)(
    'matches core recurrence from %s as of %s (%s)',
    (anchor, today, cycle, billingDay, expected) => {
      vi.setSystemTime(dayjs(today).hour(12).toDate())
      expect(
        dayjs(calculateNextPaymentDate(dayjs(anchor).toDate(), cycle, billingDay)).format(
          'YYYY-MM-DD'
        )
      ).toBe(expected)
    }
  )
})

describe('formatPaymentDate', () => {
  it('formats Date object correctly', () => {
    const date = new Date(2025, 2, 15)
    expect(formatPaymentDate(date)).toBe('Mar 15, 2025')
  })

  it('formats ISO string correctly', () => {
    expect(formatPaymentDate('2025-12-25')).toBe('Dec 25, 2025')
  })
})

describe('formatShortDate', () => {
  it('formats Date object to short format', () => {
    const date = new Date(2025, 6, 4)
    expect(formatShortDate(date)).toBe('Jul 4')
  })

  it('formats ISO string to short format', () => {
    expect(formatShortDate('2025-01-01')).toBe('Jan 1')
  })
})

describe('getDaysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns 0 for today', () => {
    expect(getDaysUntil('2025-01-15')).toBe(0)
  })

  it('returns positive number for future date', () => {
    expect(getDaysUntil('2025-01-20')).toBe(5)
  })

  it('returns negative number for past date', () => {
    expect(getDaysUntil('2025-01-10')).toBe(-5)
  })

  it('preserves local date-only values across midnight and the DST transition', () => {
    vi.setSystemTime(new Date(2026, 2, 7, 23, 59, 59))
    expect(getDaysUntil('2026-03-08')).toBe(1)
    vi.setSystemTime(new Date(2026, 2, 8, 0, 0, 0))
    expect(getDaysUntil('2026-03-08')).toBe(0)
    expect(getDaysUntil('2026-03-09')).toBe(1)
    expect(formatPaymentDate('2026-03-08')).toBe('Mar 8, 2026')
    expect(formatShortDate('2026-03-08')).toBe('Mar 8')
  })
})

describe('getUpcomingPayments', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2025, 0, 15, 12, 0, 0))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockSubscriptions = [
    { id: '1', name: 'Netflix', next_payment_date: '2025-01-20' },
    { id: '2', name: 'Spotify', next_payment_date: '2025-01-16' },
    { id: '3', name: 'AWS', next_payment_date: '2025-02-01' },
    { id: '4', name: 'Inactive', next_payment_date: null },
    { id: '5', name: 'Past', next_payment_date: '2025-01-10' },
  ]

  it('filters payments within the specified days', () => {
    const upcoming = getUpcomingPayments(mockSubscriptions, 7)
    expect(upcoming).toHaveLength(2)
  })

  it('sorts by payment date ascending', () => {
    const upcoming = getUpcomingPayments(mockSubscriptions, 7)
    expect(upcoming[0].name).toBe('Spotify')
    expect(upcoming[1].name).toBe('Netflix')
  })

  it('excludes subscriptions with null payment date', () => {
    const upcoming = getUpcomingPayments(mockSubscriptions, 30)
    expect(upcoming.find((s) => s.name === 'Inactive')).toBeUndefined()
  })

  it('excludes past payment dates', () => {
    const upcoming = getUpcomingPayments(mockSubscriptions, 30)
    expect(upcoming.find((s) => s.name === 'Past')).toBeUndefined()
  })

  it('returns empty array when no upcoming payments', () => {
    const upcoming = getUpcomingPayments([], 7)
    expect(upcoming).toHaveLength(0)
  })

  it('includes charges due today after midnight', () => {
    const today = { id: 'today', next_payment_date: '2025-01-15' }
    expect(getUpcomingPayments([today], 0)).toEqual([today])
  })
})
