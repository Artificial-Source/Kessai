import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SubscriptionsListView } from '../subscriptions-list-view'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Tag } from '@/types/tag'

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
  is_pinned: false,
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

const workTag: Tag = { id: 'tag-work', name: 'work', color: '#8b5cf6', created_at: '2026-01-01' }

const handlers = {
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onCancel: vi.fn(),
  onToggleActive: vi.fn(),
  onTogglePinned: vi.fn(),
  onMarkAsPaid: vi.fn(),
  canMarkAsPaid: vi.fn((_sub: Subscription) => false),
}

function renderList(subscriptions: Subscription[], props: Partial<typeof handlers> = {}) {
  return render(
    <SubscriptionsListView
      currency="USD"
      costNormalization="as-is"
      getCategory={(id) => (id === mockCategory.id ? mockCategory : undefined)}
      totalCount={subscriptions.length}
      subscriptions={subscriptions}
      tagById={{ [workTag.id]: workTag }}
      subscriptionTagMap={{ 'sub-1': [workTag.id] }}
      {...handlers}
      {...props}
    />
  )
}

/** Opens a row's overflow menu and picks an item by its visible label. */
function chooseFromMenu(name: string, item: string) {
  fireEvent.click(screen.getByRole('button', { name: `More actions for ${name}` }))
  fireEvent.click(
    within(screen.getByRole('menu', { name: `More actions for ${name}` })).getByRole('menuitem', {
      name: item,
    })
  )
}

describe('SubscriptionsListView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    handlers.canMarkAsPaid.mockReturnValue(false)
  })

  it('lists each subscription with its cost, cycle, and status', () => {
    renderList([makeSub()])

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Netflix')).toBeInTheDocument()
    expect(within(row).getByText('$15.99')).toBeInTheDocument()
    expect(within(row).getByText('USD/mo')).toBeInTheDocument()
    expect(within(row).getByText('Active')).toBeInTheDocument()
  })

  it('shows category and tags as named badges', () => {
    renderList([makeSub({ category_id: 'cat-streaming' })])

    const row = screen.getByRole('listitem')
    expect(within(row).getByText('Streaming')).toBeInTheDocument()
    expect(within(row).getByText('work')).toBeInTheDocument()
  })

  it('renders a zero amount as Free', () => {
    renderList([makeSub({ amount: 0 })])

    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
  })

  it('shows a trial countdown instead of a plain status', () => {
    renderList([makeSub({ status: 'trial', trial_end_date: null })])

    expect(screen.getByText('Trial')).toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('reads as paused when a billable subscription is switched off', () => {
    renderList([makeSub({ is_active: false })])

    expect(screen.getByText('Paused')).toBeInTheDocument()
  })

  it('counts visible subscriptions against the total', () => {
    render(
      <SubscriptionsListView
        currency="USD"
        costNormalization="as-is"
        getCategory={() => undefined}
        subscriptions={[makeSub(), makeSub({ id: 'sub-2', name: 'Spotify' })]}
        totalCount={5}
        {...handlers}
      />
    )

    expect(screen.getByText('2 of 5 subscriptions')).toBeInTheDocument()
  })

  it('keeps Edit visible and calls it with the subscription', () => {
    const sub = makeSub()
    renderList([sub])

    fireEvent.click(screen.getByRole('button', { name: 'Edit Netflix' }))
    expect(handlers.onEdit).toHaveBeenCalledWith(sub)
  })

  it('offers pin, pause, cancel, and delete from the named More menu', () => {
    const sub = makeSub()
    renderList([sub])

    chooseFromMenu('Netflix', 'Pin to top')
    expect(handlers.onTogglePinned).toHaveBeenCalledWith(sub)
    chooseFromMenu('Netflix', 'Pause')
    expect(handlers.onToggleActive).toHaveBeenCalledWith(sub)
    chooseFromMenu('Netflix', 'Cancel subscription')
    expect(handlers.onCancel).toHaveBeenCalledWith(sub)
    chooseFromMenu('Netflix', 'Delete')
    expect(handlers.onDelete).toHaveBeenCalledWith(sub)
  })

  it('offers Resume and Unpin for paused, pinned subscriptions', () => {
    renderList([makeSub({ is_active: false, is_pinned: true })])

    fireEvent.click(screen.getByRole('button', { name: 'More actions for Netflix' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Resume' })).toBeInTheDocument()
  })

  it('shows Mark paid only when a payment is due', () => {
    handlers.canMarkAsPaid.mockImplementation((sub: Subscription) => sub.id === 'sub-due')
    const due = makeSub({ id: 'sub-due', name: 'Hulu' })
    renderList([makeSub(), due])

    expect(screen.queryByRole('button', { name: 'Mark paid for Netflix' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid for Hulu' }))
    expect(handlers.onMarkAsPaid).toHaveBeenCalledWith(due)
  })
})
