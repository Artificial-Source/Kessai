import { describe, expect, it } from 'vitest'
import { buildDecisions, buildReviewCandidates } from '../dashboard-decisions'
import type { PriceChange } from '@/lib/api'
import type { Subscription } from '@/types/subscription'

const TODAY = '2026-10-22'

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
  next_payment_date: '2026-11-01',
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  last_reviewed_at: null,
  created_at: '2026-10-20T00:00:00Z',
  updated_at: '2026-10-20T00:00:00Z',
  ...overrides,
})

const trial = (id: string, trial_end_date: string | null, overrides: Partial<Subscription> = {}) =>
  subscription({ id, name: id, status: 'trial', trial_end_date, ...overrides })

const change = (overrides: Partial<PriceChange> = {}): PriceChange => ({
  id: 'change',
  subscription_id: 'sub',
  old_amount: 15.99,
  new_amount: 17.99,
  old_currency: 'USD',
  new_currency: 'USD',
  changed_at: '2026-10-10T09:00:00Z',
  ...overrides,
})

describe('buildDecisions', () => {
  it('includes trials ending within 7 days and ended trials, most urgent first', () => {
    const decisions = buildDecisions(
      [
        trial('in-7', '2026-10-29'),
        trial('in-8', '2026-10-30'),
        trial('tomorrow', '2026-10-23'),
        trial('ended', '2026-10-01'),
        trial('no-end-date', null),
        trial('in-3', '2026-10-25'),
        trial('inactive', '2026-10-23', { is_active: false }),
      ],
      [],
      TODAY
    )

    expect(
      decisions.map((d) => [d.subscription.id, d.kind === 'trial' ? d.daysLeft : null])
    ).toEqual([
      ['ended', -21],
      ['tomorrow', 1],
      ['in-3', 3],
      ['in-7', 7],
    ])
  })

  it('flags a next payment recorded before the trial ends instead of correcting it', () => {
    const decisions = buildDecisions(
      [
        trial('linear', '2026-10-27', { next_payment_date: '2026-10-24' }),
        trial('headspace', '2026-10-27', { next_payment_date: '2026-11-05' }),
      ],
      [],
      TODAY
    )
    const byId = (id: string) => decisions.find((d) => d.subscription.id === id)
    expect(byId('linear')).toMatchObject({ kind: 'trial', datesConflict: true })
    expect(byId('headspace')).toMatchObject({ kind: 'trial', datesConflict: false })
  })

  it('lists grace periods between imminent and later trials', () => {
    const decisions = buildDecisions(
      [
        trial('later', '2026-10-27'),
        subscription({ id: 'grace', status: 'grace_period' }),
        trial('today', TODAY),
      ],
      [],
      TODAY
    )
    expect(decisions.map((d) => d.subscription.id)).toEqual(['today', 'grace', 'later'])
  })

  it('includes a same-currency increase newer than the last review', () => {
    const [decision] = buildDecisions(
      [subscription({ last_reviewed_at: '2026-10-01T00:00:00Z' })],
      [change()],
      TODAY
    )
    expect(decision).toMatchObject({ kind: 'price-change', sameCurrency: true })
  })

  it('ignores changes already reviewed, decreases, and cancelled subscriptions', () => {
    expect(
      buildDecisions(
        [subscription({ last_reviewed_at: '2026-10-11T00:00:00Z' })],
        [change()],
        TODAY
      )
    ).toEqual([])
    expect(
      buildDecisions([subscription()], [change({ old_amount: 20, new_amount: 18 })], TODAY)
    ).toEqual([])
    expect(
      buildDecisions([subscription({ status: 'cancelled', is_active: false })], [change()], TODAY)
    ).toEqual([])
    expect(buildDecisions([subscription()], [change({ subscription_id: 'gone' })], TODAY)).toEqual(
      []
    )
  })

  it('names a currency change without calling it an increase', () => {
    const [decision] = buildDecisions(
      [subscription()],
      [change({ old_currency: 'EUR', new_currency: 'USD', old_amount: 20, new_amount: 19 })],
      TODAY
    )
    expect(decision).toMatchObject({ kind: 'price-change', sameCurrency: false })
  })

  it('uses only the latest recorded change of each subscription', () => {
    const decisions = buildDecisions(
      [subscription()],
      [
        change({ id: 'old', changed_at: '2026-09-01T00:00:00Z' }),
        change({
          id: 'new',
          changed_at: '2026-10-15T00:00:00Z',
          old_amount: 17.99,
          new_amount: 19.99,
        }),
      ],
      TODAY
    )
    expect(decisions.map((d) => d.id)).toEqual(['price:new'])
  })

  it('returns nothing when no deadlines or changes exist', () => {
    expect(buildDecisions([subscription(), trial('far', '2026-12-01')], [], TODAY)).toEqual([])
  })
})

describe('buildReviewCandidates', () => {
  const options = { today: TODAY, displayCurrency: 'USD' }

  it('does not flood with new records that were never reviewed', () => {
    const candidates = buildReviewCandidates(
      [
        subscription({ id: 'new', created_at: '2026-10-20T00:00:00Z' }),
        // Local times: the 30-day boundary is a local calendar day.
        subscription({ id: 'day-29', created_at: '2026-09-23T12:00:00' }),
        subscription({ id: 'day-30', created_at: '2026-09-22T12:00:00' }),
      ],
      options
    )
    expect(candidates.map((c) => [c.subscription.id, c.reason])).toEqual([
      ['day-30', 'never-reviewed'],
    ])
  })

  it('counts from the last review when there is one', () => {
    const candidates = buildReviewCandidates(
      [
        subscription({
          id: 'recent',
          created_at: '2025-01-01T00:00:00Z',
          last_reviewed_at: '2026-10-15T00:00:00Z',
        }),
        subscription({
          id: 'stale',
          created_at: '2025-01-01T00:00:00Z',
          last_reviewed_at: '2026-09-01T00:00:00Z',
        }),
      ],
      options
    )
    expect(candidates.map((c) => [c.subscription.id, c.reason, c.since])).toEqual([
      ['stale', 'not-reviewed', '2026-09-01T00:00:00Z'],
    ])
  })

  it('leaves out trials, grace periods, paused and cancelled records and decisions', () => {
    const old = '2025-01-01T00:00:00Z'
    const candidates = buildReviewCandidates(
      [
        subscription({ id: 'trial', status: 'trial', created_at: old }),
        subscription({ id: 'grace', status: 'grace_period', created_at: old }),
        subscription({ id: 'paused', status: 'paused', is_active: false, created_at: old }),
        subscription({ id: 'cancelled', status: 'cancelled', is_active: false, created_at: old }),
        subscription({ id: 'decided', created_at: old }),
        subscription({ id: 'kept', created_at: old }),
      ],
      { ...options, exclude: new Set(['decided']) }
    )
    expect(candidates.map((c) => c.subscription.id)).toEqual(['kept'])
  })

  it('puts pending cancellations first, then the highest monthly share, then other currencies', () => {
    const old = '2025-01-01T00:00:00Z'
    const candidates = buildReviewCandidates(
      [
        subscription({ id: 'cheap', name: 'Cheap', amount: 4, created_at: old }),
        subscription({
          id: 'yearly',
          name: 'Yearly',
          amount: 240,
          billing_cycle: 'yearly',
          created_at: old,
        }),
        subscription({
          id: 'shared',
          name: 'Shared',
          amount: 69,
          shared_count: 6,
          created_at: old,
        }),
        subscription({ id: 'yen', name: 'Yen', amount: 3200, currency: 'JPY', created_at: old }),
        subscription({
          id: 'leaving',
          name: 'Leaving',
          status: 'pending_cancellation',
          status_changed_at: '2026-10-02T00:00:00Z',
        }),
      ],
      options
    )
    expect(candidates.map((c) => [c.subscription.id, Number(c.monthlyShare.toFixed(2))])).toEqual([
      ['leaving', 10],
      ['yearly', 20],
      ['shared', 11.5],
      ['cheap', 4],
      ['yen', 3200],
    ])
    expect(candidates[0]).toMatchObject({
      reason: 'cancellation-pending',
      since: '2026-10-02T00:00:00Z',
    })
  })
})
