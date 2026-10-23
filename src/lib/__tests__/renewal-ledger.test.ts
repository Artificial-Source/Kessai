import { describe, expect, it } from 'vitest'
import {
  buildRenewalLedger,
  formatDateRange,
  ledgerWindow,
  nextRenewalAfter,
  summarizeMonthRecords,
} from '../renewal-ledger'
import type { CalendarOccurrence, Payment } from '@/types/payment'
import type { Subscription } from '@/types/subscription'

const TODAY = '2026-10-22'

const occurrence = (overrides: Partial<CalendarOccurrence> = {}): CalendarOccurrence => ({
  subscription_id: 'sub',
  name: 'Subscription',
  category_id: null,
  currency: 'USD',
  billing_cycle: 'monthly',
  status: 'active',
  is_active: true,
  logo_url: null,
  projected_amount: 10,
  due_date: '2026-10-23',
  payment: null,
  ...overrides,
})

const payment = (status: Payment['status'], overrides: Partial<Payment> = {}): Payment => ({
  id: `pay-${status}`,
  subscription_id: 'sub',
  amount: 10,
  paid_at: '2026-10-20T10:00:00Z',
  due_date: '2026-10-23',
  status,
  ...overrides,
})

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'sub',
  name: 'Subscription',
  amount: 10,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: null,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: null,
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const build = (occurrences: CalendarOccurrence[], subscriptions: Subscription[] = []) =>
  buildRenewalLedger(occurrences, { today: TODAY, displayCurrency: 'USD', subscriptions })

describe('ledgerWindow', () => {
  it('covers today through today + 29 and every month it touches', () => {
    expect(ledgerWindow(TODAY)).toEqual({
      start: '2026-10-22',
      end: '2026-11-20',
      months: [
        { year: 2026, month: 10 },
        { year: 2026, month: 11 },
      ],
    })
  })

  it('touches three months when February is short', () => {
    expect(ledgerWindow('2027-01-31').months).toEqual([
      { year: 2027, month: 1 },
      { year: 2027, month: 2 },
      { year: 2027, month: 3 },
    ])
    expect(ledgerWindow('2027-01-31').end).toBe('2027-03-01')
  })

  it('stays in one month when the window fits', () => {
    expect(ledgerWindow('2026-12-01').months).toEqual([{ year: 2026, month: 12 }])
  })
})

describe('buildRenewalLedger', () => {
  it('lists every weekly occurrence across the month boundary from both projections', () => {
    const weekly = (due_date: string) =>
      occurrence({ subscription_id: 'kit', name: 'Meal Kit', billing_cycle: 'weekly', due_date })
    const ledger = build([
      weekly('2026-10-19'),
      weekly('2026-10-26'),
      weekly('2026-11-02'),
      weekly('2026-11-09'),
      weekly('2026-11-16'),
      weekly('2026-11-23'),
    ])

    expect(ledger.upcoming.map((entry) => entry.dueDate)).toEqual([
      '2026-10-26',
      '2026-11-02',
      '2026-11-09',
      '2026-11-16',
    ])
    // A count of occurrences, not subscriptions.
    expect(ledger.subtotal.count).toBe(4)
    expect(ledger.upcoming.map((entry) => entry.key)).toEqual([
      'kit:2026-10-26',
      'kit:2026-11-02',
      'kit:2026-11-09',
      'kit:2026-11-16',
    ])
  })

  it('includes today + 29 and excludes today + 30', () => {
    const ledger = build([
      occurrence({ subscription_id: 'last', due_date: '2026-11-20' }),
      occurrence({ subscription_id: 'after', due_date: '2026-11-21' }),
      occurrence({ subscription_id: 'today', due_date: TODAY }),
    ])

    expect(ledger.upcoming.map((entry) => entry.subscriptionId)).toEqual(['today', 'last'])
  })

  it('groups by Today, Next 7 days (days 1–7) and Later (days 8–29)', () => {
    const ledger = build([
      occurrence({ subscription_id: 'a', due_date: '2026-10-22' }),
      occurrence({ subscription_id: 'b', due_date: '2026-10-23' }),
      occurrence({ subscription_id: 'c', due_date: '2026-10-29' }),
      occurrence({ subscription_id: 'd', due_date: '2026-10-30' }),
    ])

    expect(
      ledger.groups.map((group) => ({
        id: group.id,
        start: group.start,
        end: group.end,
        ids: group.entries.map((entry) => entry.subscriptionId),
      }))
    ).toEqual([
      { id: 'today', start: '2026-10-22', end: '2026-10-22', ids: ['a'] },
      { id: 'week', start: '2026-10-23', end: '2026-10-29', ids: ['b', 'c'] },
      { id: 'later', start: '2026-10-30', end: '2026-11-20', ids: ['d'] },
    ])
  })

  it('leaves out paid and skipped occurrences but keeps pending ones at the recorded amount', () => {
    const ledger = build([
      occurrence({
        subscription_id: 'paid',
        payment: payment('paid', { subscription_id: 'paid' }),
      }),
      occurrence({
        subscription_id: 'skipped',
        payment: payment('skipped', { subscription_id: 'skipped' }),
      }),
      occurrence({
        subscription_id: 'pending',
        projected_amount: 12,
        payment: payment('pending', { subscription_id: 'pending', amount: 11.5 }),
      }),
      occurrence({ subscription_id: 'open' }),
    ])

    expect(ledger.upcoming.map((entry) => [entry.subscriptionId, entry.amount])).toEqual([
      ['open', 10],
      ['pending', 11.5],
    ])
    expect(ledger.upcoming.find((e) => e.subscriptionId === 'pending')?.key).toBe('pay-pending')
  })

  it('keeps unrecorded earlier dates of this month in their own group, never in the total', () => {
    const ledger = build([
      occurrence({ subscription_id: 'early', due_date: '2026-10-05' }),
      occurrence({ subscription_id: 'early', due_date: '2026-10-12' }),
      occurrence({
        subscription_id: 'settled',
        due_date: '2026-10-09',
        payment: payment('paid', { subscription_id: 'settled', due_date: '2026-10-09' }),
      }),
      // Last month is Calendar's business, not an unbounded backlog on home.
      occurrence({ subscription_id: 'old', due_date: '2026-09-28' }),
      occurrence({ subscription_id: 'next', due_date: '2026-10-24', projected_amount: 4 }),
    ])

    expect(ledger.earlier.map((entry) => [entry.subscriptionId, entry.dueDate])).toEqual([
      ['early', '2026-10-05'],
      ['early', '2026-10-12'],
    ])
    expect(ledger.earlier[0].daysUntil).toBe(-17)
    expect(ledger.subtotal).toEqual({ amount: 4, count: 1, excludedCurrencies: {} })
  })

  it('keeps the full charge on shared plans and adds the user share beside it', () => {
    const ledger = build(
      [occurrence({ subscription_id: 'kit', projected_amount: 69, due_date: '2026-10-26' })],
      [subscription({ id: 'kit', amount: 69, shared_count: 2, color: '#123456' })]
    )

    expect(ledger.upcoming[0]).toMatchObject({
      amount: 69,
      share: 34.5,
      sharedCount: 2,
      color: '#123456',
    })
    // The subtotal is on the same full-charge basis as the rows.
    expect(ledger.subtotal.amount).toBe(69)
  })

  it('rounds the share to the currency’s minor units', () => {
    const ledger = buildRenewalLedger(
      [
        occurrence({ subscription_id: 'yen', currency: 'JPY', projected_amount: 1000 }),
        occurrence({ subscription_id: 'usd', projected_amount: 16.99 }),
      ],
      {
        today: TODAY,
        displayCurrency: 'USD',
        subscriptions: [
          subscription({ id: 'yen', shared_count: 3 }),
          subscription({ id: 'usd', shared_count: 6 }),
        ],
      }
    )
    expect(ledger.upcoming.map((entry) => entry.share)).toEqual([2.83, 333])
  })

  it('keeps foreign-currency rows in date order and leaves them out of the subtotal', () => {
    const ledger = build([
      occurrence({ subscription_id: 'usd', due_date: '2026-10-25', projected_amount: 22.99 }),
      occurrence({
        subscription_id: 'eur',
        currency: 'EUR',
        due_date: '2026-10-24',
        projected_amount: 1234.56,
      }),
      occurrence({
        subscription_id: 'jpy',
        currency: 'JPY',
        due_date: '2026-10-31',
        projected_amount: 3200,
      }),
      occurrence({ subscription_id: 'usd2', due_date: '2026-10-28', projected_amount: 9.99 }),
    ])

    expect(ledger.upcoming.map((entry) => entry.subscriptionId)).toEqual([
      'eur',
      'usd',
      'usd2',
      'jpy',
    ])
    expect(ledger.subtotal).toEqual({
      amount: 32.98,
      count: 2,
      excludedCurrencies: { EUR: 1, JPY: 1 },
    })
  })

  it('reports an all-foreign window as zero counted charges, not as empty', () => {
    const ledger = build([
      occurrence({ subscription_id: 'eur', currency: 'EUR' }),
      occurrence({ subscription_id: 'eur', currency: 'EUR', due_date: '2026-11-03' }),
    ])

    expect(ledger.upcoming).toHaveLength(2)
    expect(ledger.subtotal).toEqual({ amount: 0, count: 0, excludedCurrencies: { EUR: 2 } })
  })

  it('drops unresolved occurrences of subscriptions that no longer bill', () => {
    const ledger = build([
      occurrence({ subscription_id: 'paused', status: 'paused', is_active: false }),
      occurrence({
        subscription_id: 'gone',
        status: 'cancelled',
        is_active: false,
        payment: payment('pending', { id: 'pending-gone', subscription_id: 'gone' }),
      }),
      occurrence({ subscription_id: 'trial', status: 'trial' }),
    ])

    expect(ledger.upcoming.map((entry) => entry.subscriptionId)).toEqual(['trial'])
  })

  it('sorts by due date, then name, regardless of pins or input order', () => {
    const ledger = build([
      occurrence({ subscription_id: 'z', name: 'Zeta', due_date: '2026-10-24' }),
      occurrence({ subscription_id: 'b', name: 'Beta', due_date: '2026-10-23' }),
      occurrence({ subscription_id: 'a', name: 'Alpha', due_date: '2026-10-24' }),
    ])

    expect(ledger.upcoming.map((entry) => entry.name)).toEqual(['Beta', 'Alpha', 'Zeta'])
  })
})

describe('summarizeMonthRecords', () => {
  it('separates marked paid, not yet recorded and skipped by due date, skips never added', () => {
    const records = summarizeMonthRecords(
      [
        occurrence({ due_date: '2026-10-05', payment: payment('paid', { amount: 69 }) }),
        occurrence({ due_date: '2026-10-12', payment: payment('skipped', { amount: 69 }) }),
        occurrence({ due_date: '2026-10-19', projected_amount: 69 }),
        occurrence({ due_date: '2026-10-26', projected_amount: 69 }),
        occurrence({ due_date: '2026-10-28', currency: 'EUR', projected_amount: 1234.56 }),
      ],
      'USD'
    )

    expect(records).toEqual({
      count: 5,
      paid: { count: 1, amount: 69 },
      unrecorded: { count: 3, amount: 138 },
      skippedCount: 1,
      excludedCurrencies: { EUR: 1 },
    })
  })
})

describe('nextRenewalAfter', () => {
  it('finds the soonest billable renewal past the window', () => {
    expect(
      nextRenewalAfter(
        [
          subscription({ id: 'yearly', next_payment_date: '2027-02-19' }),
          subscription({ id: 'inside', next_payment_date: '2026-11-01' }),
          subscription({ id: 'paused', status: 'paused', next_payment_date: '2026-12-01' }),
          subscription({ id: 'quarterly', next_payment_date: '2026-12-06' }),
        ],
        '2026-11-20'
      )?.id
    ).toBe('quarterly')
  })
})

describe('formatDateRange', () => {
  it('shortens ranges within a month and names both months otherwise', () => {
    expect(formatDateRange('2026-10-23', '2026-10-29')).toBe('Oct 23 – 29')
    expect(formatDateRange('2026-10-30', '2026-11-20')).toBe('Oct 30 – Nov 20')
    expect(formatDateRange('2026-12-20', '2027-01-18')).toBe('Dec 20 – Jan 18, 2027')
    expect(formatDateRange('2026-10-22', '2026-10-22')).toBe('Oct 22')
  })
})
