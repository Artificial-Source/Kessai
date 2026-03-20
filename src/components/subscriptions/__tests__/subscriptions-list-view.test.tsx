import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubscriptionsListView } from '../subscriptions-list-view'
import { usePriceHistoryStore } from '@/stores/price-history-store'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const makeSub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'sub-1',
  name: 'Netflix',
  amount: 15.99,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 1,
  category_id: null,
  card_id: null,
  color: '#8b5cf6',
  logo_url: null,
  notes: null,
  is_active: true,
  next_payment_date: '2026-04-01',
  status: 'active',
  trial_end_date: null,
  status_changed_at: null,
  shared_count: 1,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const mockCategory: Category = {
  id: 'cat-streaming',
  name: 'Streaming',
  color: '#8b5cf6',
  icon: 'play-circle',
  is_default: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

const defaultProps = {
  currency: 'USD' as const,
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onToggleActive: vi.fn(),
}

describe('SubscriptionsListView', () => {
  beforeEach(() => {
    usePriceHistoryStore.setState({
      recentChanges: [],
      isLoading: false,
      error: null,
      fetchRecent: vi.fn().mockResolvedValue(undefined),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
      getLatest: vi.fn().mockResolvedValue(null),
    })
  })

  it('renders table headers', () => {
    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={[]}
        totalCount={0}
        getCategory={() => undefined}
      />
    )

    expect(screen.getByText('Service')).toBeInTheDocument()
    expect(screen.getByText('Cost')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Actions')).toBeInTheDocument()
  })

  it('renders subscription rows', () => {
    const subs = [makeSub({ id: 'sub-1', name: 'Netflix' })]

    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={subs}
        totalCount={1}
        getCategory={() => undefined}
      />
    )

    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders empty table with 0 of 0 subscriptions', () => {
    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={[]}
        totalCount={0}
        getCategory={() => undefined}
      />
    )

    expect(screen.getByText('0 of 0 subscriptions')).toBeInTheDocument()
  })

  it('shows category badge when category exists', () => {
    const subs = [makeSub({ id: 'sub-1', name: 'Netflix', category_id: 'cat-streaming' })]

    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={subs}
        totalCount={1}
        getCategory={() => mockCategory}
      />
    )

    expect(screen.getByText('Streaming')).toBeInTheDocument()
  })

  it('shows count of visible subscriptions', () => {
    const subs = [
      makeSub({ id: 'sub-1', name: 'Netflix' }),
      makeSub({ id: 'sub-2', name: 'Spotify' }),
    ]

    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={subs}
        totalCount={5}
        getCategory={() => undefined}
      />
    )

    expect(screen.getByText('2 of 5 subscriptions')).toBeInTheDocument()
  })

  it('shows paused status for inactive subscription', () => {
    const subs = [makeSub({ id: 'sub-1', name: 'Netflix', is_active: false })]

    render(
      <SubscriptionsListView
        {...defaultProps}
        subscriptions={subs}
        totalCount={1}
        getCategory={() => undefined}
      />
    )

    expect(screen.getByText('Paused')).toBeInTheDocument()
  })
})
