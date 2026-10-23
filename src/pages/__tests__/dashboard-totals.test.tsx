import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import { Dashboard } from '../dashboard'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Category } from '@/types/category'
import type { Subscription } from '@/types/subscription'

const NOTE = 'Excludes 1 in JPY'

const inDays = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD')

const subscription = (overrides: Partial<Subscription>): Subscription => ({
  id: 'subscription',
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
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

const categories: Category[] = [
  {
    id: 'cat-streaming',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'play-circle',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-software',
    name: 'Software',
    color: '#3b82f6',
    icon: 'code',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

const subscriptions = [
  // $60 split three ways: $20/mo, $20 due
  subscription({
    id: 'stream',
    name: 'Stream Club',
    amount: 60,
    shared_count: 3,
    category_id: 'cat-streaming',
    next_payment_date: inDays(2),
  }),
  // $120/yr split two ways: $5/mo, $60 due
  subscription({
    id: 'vault',
    name: 'Cloud Vault',
    amount: 120,
    billing_cycle: 'yearly',
    shared_count: 2,
    category_id: 'cat-software',
    next_payment_date: inDays(3),
  }),
  subscription({
    id: 'anime',
    name: 'Anime Box',
    amount: 1500,
    currency: 'JPY',
    category_id: 'cat-streaming',
    next_payment_date: inDays(1),
  }),
  // $40 split four ways: $10/mo, outside the upcoming window
  subscription({
    id: 'gym',
    name: 'Studio Gym',
    amount: 40,
    shared_count: 4,
    next_payment_date: inDays(15),
  }),
  subscription({
    id: 'paused',
    name: 'Paused Radio',
    amount: 30,
    is_active: false,
    status: 'paused',
    next_payment_date: inDays(2),
  }),
]

function renderDashboard(list: Subscription[], error: string | null = null) {
  const fetch = vi.fn().mockResolvedValue(undefined)
  useSubscriptionStore.setState({
    subscriptions: list,
    isLoading: false,
    error,
    fetch,
  })
  render(<Dashboard />, { wrapper: MemoryRouter })
  return { fetch }
}

/** A stat card is a group named by its label; its first number is the headline value. */
const card = (label: string, value: string) => {
  const group = screen.getByRole('group', { name: label })
  expect(within(group).getByText(value)).toBeInTheDocument()
  return group
}

const section = (heading: string) => screen.getByRole('region', { name: heading })

beforeEach(() => {
  useCategoryStore.setState({
    categories,
    isLoading: false,
    error: null,
    fetch: vi.fn().mockResolvedValue(undefined),
  })
  useSettingsStore.setState({
    settings: { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'USD', monthly_budget: 100 },
    isLoading: false,
    error: null,
    fetch: vi.fn().mockResolvedValue(undefined),
  })
  useUiStore.setState({ costNormalization: 'as-is' })
})

afterEach(cleanup)

describe('Dashboard totals', () => {
  it('shows user-share stat totals in the settings currency with exclusion notes', () => {
    renderDashboard(subscriptions)
    // The same names as the Subscriptions header: the period total leads, then each cycle.
    const total = card('Monthly total', '$35.00')
    expect(within(total).getByText('/mo')).toBeInTheDocument()
    expect(within(total).getByText('4 active subscriptions')).toBeInTheDocument()
    expect(within(total).getByText(NOTE)).toBeInTheDocument()

    const monthly = card('Billed monthly', '$30.00')
    expect(within(monthly).getByText('2 subscriptions')).toBeInTheDocument()
    expect(within(monthly).getByText(NOTE)).toBeInTheDocument()

    const yearly = card('Billed yearly', '$60.00')
    expect(within(yearly).getByText('1 subscription')).toBeInTheDocument()
    expect(within(yearly).queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('names the period total after the chosen normalization', () => {
    useUiStore.setState({ costNormalization: 'yearly' })
    renderDashboard(subscriptions)

    const total = card('Yearly total', '$420.00')
    expect(within(total).getByText('/yr')).toBeInTheDocument()
  })

  it('measures the budget against the user-share monthly total', () => {
    renderDashboard(subscriptions)

    const budget = section('Monthly budget')
    expect(within(budget).getByText('35%')).toBeInTheDocument()
    expect(within(budget).getByText('$35.00')).toBeInTheDocument()
    expect(within(budget).getByText('$65.00')).toBeInTheDocument()
    expect(within(budget).getByText(NOTE)).toBeInTheDocument()
  })

  it('breaks categories down by user share without other currencies', () => {
    renderDashboard(subscriptions)

    const categoriesSection = section('Spending by category')
    const row = (name: string) => within(categoriesSection).getByText(name).closest('li')!

    expect(within(row('Streaming')).getByText('$20.00')).toBeInTheDocument()
    expect(within(row('Streaming')).getByText('57%')).toBeInTheDocument()
    expect(within(row('Uncategorized')).getByText('$10.00')).toBeInTheDocument()
    expect(within(row('Software')).getByText('$5.00')).toBeInTheDocument()
    expect(within(categoriesSection).getByText(NOTE)).toBeInTheDocument()
  })

  it('sums the as-billed user share due this week and keeps rows in their own currency', () => {
    renderDashboard(subscriptions)

    const due = card('Due this week', '3')
    expect(within(due).getByText('$80.00 total')).toBeInTheDocument()
    expect(within(due).getByText(NOTE)).toBeInTheDocument()

    const upcoming = section('Upcoming payments')
    expect(within(upcoming).getByText('$80.00')).toBeInTheDocument()
    expect(within(upcoming).getByText(NOTE)).toBeInTheDocument()
    // Rows show the full charge as billed, in the subscription's own currency.
    expect(within(upcoming).getByText('$60.00')).toBeInTheDocument()
    expect(within(upcoming).getByText('$120.00')).toBeInTheDocument()
    const yen = within(upcoming).getByText(/1,500/)
    expect(yen).not.toHaveTextContent('$')
    expect(yen.nextElementSibling).toHaveTextContent('JPY')
    expect(within(upcoming).queryByText('Paused Radio')).not.toBeInTheDocument()
  })

  it('omits exclusion notes when every billable subscription uses the settings currency', () => {
    renderDashboard(subscriptions.filter((sub) => sub.currency === 'USD'))

    expect(card('Due this week', '2')).toBeInTheDocument()
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument()
  })

  it('says the load failed instead of showing zeros or "nothing due"', () => {
    const { fetch } = renderDashboard([], 'Error: connection refused')

    expect(
      within(screen.getByRole('group', { name: 'Monthly total' })).getByText('—')
    ).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing due in the next 7 days')).not.toBeInTheDocument()

    const upcoming = section('Upcoming payments')
    expect(within(upcoming).getByText('Couldn’t load your subscriptions')).toBeInTheDocument()
    fetch.mockClear()
    fireEvent.click(within(upcoming).getByRole('button', { name: 'Retry' }))
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('shows a calm empty state when nothing is due', () => {
    renderDashboard([subscription({ id: 'later', next_payment_date: inDays(30) })])

    expect(
      within(section('Upcoming payments')).getByText('Nothing due in the next 7 days')
    ).toBeInTheDocument()
    expect(screen.queryByText('No subscriptions yet')).not.toBeInTheDocument()
  })

  it('greets a first run with a way to add or import, not an empty week', () => {
    useUiStore.setState({ subscriptionDialogOpen: false, editingSubscriptionId: null })
    renderDashboard([])

    const upcoming = section('Upcoming payments')
    expect(within(upcoming).getByRole('heading', { name: 'No subscriptions yet' })).toBeVisible()
    expect(within(upcoming).queryByText('Nothing due in the next 7 days')).not.toBeInTheDocument()
    expect(within(upcoming).getByRole('button', { name: 'Import data' })).toBeInTheDocument()

    fireEvent.click(within(upcoming).getByRole('button', { name: 'Add your first subscription' }))
    expect(useUiStore.getState()).toMatchObject({
      subscriptionDialogOpen: true,
      editingSubscriptionId: null,
    })
  })
})
