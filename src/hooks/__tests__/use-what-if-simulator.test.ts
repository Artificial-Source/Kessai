import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useWhatIfSimulator } from '../use-what-if-simulator'
import { useSubscriptionStore } from '@/stores/subscription-store'
import type { Subscription } from '@/types/subscription'

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Netflix',
    amount: 15,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: 1,
    category_id: null,
    card_id: null,
    color: null,
    logo_url: null,
    notes: null,
    is_active: true,
    next_payment_date: '2024-02-01',
    status: 'active',
    trial_end_date: null,
    status_changed_at: null,
    shared_count: 1,
    is_pinned: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useWhatIfSimulator', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      subscriptions: [],
      isLoading: false,
      error: null,
    })
  })

  it('handles empty subscriptions', () => {
    const { result } = renderHook(() => useWhatIfSimulator())

    expect(result.current.activeSubscriptions).toHaveLength(0)
    expect(result.current.currentAnnual).toBe(0)
    expect(result.current.simulatedAnnual).toBe(0)
    expect(result.current.annualSavings).toBe(0)
    expect(result.current.monthlySavings).toBe(0)
  })

  it('computes correct annual and monthly totals', () => {
    useSubscriptionStore.setState({
      subscriptions: [makeSub({ id: 'sub-1', amount: 12, billing_cycle: 'monthly' })],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    // $12/month * 12 = $144/year
    expect(result.current.currentAnnual).toBe(144)
    expect(result.current.simulatedAnnual).toBe(144)
    expect(result.current.annualSavings).toBe(0)
  })

  it('calculates savings from excluding a subscription', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        makeSub({ id: 'sub-1', amount: 12, billing_cycle: 'monthly' }),
        makeSub({ id: 'sub-2', amount: 120, billing_cycle: 'yearly' }),
      ],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    // Total: 12*12 + 120*1 = 144 + 120 = 264
    expect(result.current.currentAnnual).toBe(264)

    act(() => {
      result.current.toggleExcluded('sub-1')
    })

    // Only sub-2 remains: 120
    expect(result.current.simulatedAnnual).toBe(120)
    expect(result.current.annualSavings).toBe(144)
    expect(result.current.monthlySavings).toBe(12)
  })

  it('toggles exclusion on and off', () => {
    useSubscriptionStore.setState({
      subscriptions: [makeSub({ id: 'sub-1', amount: 10, billing_cycle: 'monthly' })],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    act(() => {
      result.current.toggleExcluded('sub-1')
    })
    expect(result.current.excludedIds.has('sub-1')).toBe(true)
    expect(result.current.simulatedAnnual).toBe(0)

    act(() => {
      result.current.toggleExcluded('sub-1')
    })
    expect(result.current.excludedIds.has('sub-1')).toBe(false)
    expect(result.current.simulatedAnnual).toBe(120)
  })

  it('resets excluded subscriptions', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        makeSub({ id: 'sub-1', amount: 10, billing_cycle: 'monthly' }),
        makeSub({ id: 'sub-2', amount: 20, billing_cycle: 'monthly' }),
      ],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    act(() => {
      result.current.toggleExcluded('sub-1')
      result.current.toggleExcluded('sub-2')
    })
    expect(result.current.simulatedAnnual).toBe(0)

    act(() => {
      result.current.reset()
    })
    expect(result.current.excludedIds.size).toBe(0)
    expect(result.current.simulatedAnnual).toBe(360)
  })

  it('only includes billable statuses (active, trial, grace_period)', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        makeSub({ id: 'sub-1', amount: 10, billing_cycle: 'monthly', status: 'active' }),
        makeSub({ id: 'sub-2', amount: 10, billing_cycle: 'monthly', status: 'cancelled' }),
        makeSub({ id: 'sub-3', amount: 10, billing_cycle: 'monthly', status: 'paused' }),
        makeSub({ id: 'sub-4', amount: 10, billing_cycle: 'monthly', status: 'trial' }),
      ],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    // Only sub-1 (active) and sub-4 (trial) are billable
    expect(result.current.activeSubscriptions).toHaveLength(2)
    expect(result.current.currentAnnual).toBe(240)
  })

  it('handles shared subscriptions correctly', () => {
    useSubscriptionStore.setState({
      subscriptions: [
        makeSub({ id: 'sub-1', amount: 20, billing_cycle: 'monthly', shared_count: 4 }),
      ],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    // $20/month / 4 people = $5/month user cost, * 12 = $60/year
    expect(result.current.currentAnnual).toBe(60)
  })

  it('computes simulatedMonthly correctly', () => {
    useSubscriptionStore.setState({
      subscriptions: [makeSub({ id: 'sub-1', amount: 12, billing_cycle: 'monthly' })],
    })

    const { result } = renderHook(() => useWhatIfSimulator())

    expect(result.current.simulatedMonthly).toBe(12)

    act(() => {
      result.current.toggleExcluded('sub-1')
    })

    expect(result.current.simulatedMonthly).toBe(0)
  })
})
