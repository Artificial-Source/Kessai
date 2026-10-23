import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import { Dashboard } from '../dashboard'
import { calendarMonthKey, ledgerWindow } from '@/lib/renewal-ledger'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePaymentStore } from '@/stores/payment-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type * as ApiModule from '@/lib/api'
import type { Category } from '@/types/category'
import type { CalendarOccurrence } from '@/types/payment'
import type { Subscription } from '@/types/subscription'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const inDays = (days: number) => dayjs().add(days, 'day').format('YYYY-MM-DD')
const daysAgo = (days: number) => dayjs().subtract(days, 'day').toISOString()

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
  last_reviewed_at: null,
  created_at: daysAgo(2),
  updated_at: daysAgo(2),
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
]

const subscriptions = [
  // $60 split three ways: $20/mo
  subscription({
    id: 'stream',
    name: 'Stream Club',
    amount: 60,
    shared_count: 3,
    category_id: 'cat-streaming',
    next_payment_date: inDays(2),
  }),
  // $120/yr split two ways: $5/mo
  subscription({
    id: 'vault',
    name: 'Cloud Vault',
    amount: 120,
    billing_cycle: 'yearly',
    shared_count: 2,
    next_payment_date: inDays(3),
  }),
  subscription({
    id: 'anime',
    name: 'Anime Box',
    amount: 1500,
    currency: 'JPY',
    next_payment_date: inDays(1),
  }),
  // A trial ending in two days: a decision, and $10/mo of the total at its recorded price
  subscription({
    id: 'gym',
    name: 'Studio Gym',
    amount: 40,
    shared_count: 4,
    status: 'trial',
    trial_end_date: inDays(2),
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

/** The projection the calendar query would return: one occurrence per next payment date. */
function project(list: Subscription[]): CalendarOccurrence[] {
  return list
    .filter((s) => s.is_active && s.next_payment_date)
    .map((s) => ({
      subscription_id: s.id,
      name: s.name,
      category_id: s.category_id,
      currency: s.currency,
      billing_cycle: s.billing_cycle,
      status: s.status,
      is_active: s.is_active,
      logo_url: null,
      projected_amount: s.amount,
      due_date: s.next_payment_date!,
      payment: null,
    }))
}

function renderDashboard(
  list: Subscription[],
  { fetchError = null, budget = 100 }: { fetchError?: string | null; budget?: number | null } = {}
) {
  const fetch = vi.fn().mockResolvedValue(undefined)
  const occurrences = project(list)
  useSubscriptionStore.setState({
    subscriptions: list,
    isLoading: false,
    error: fetchError,
    fetchError,
    fetch,
    transitionStatus: vi.fn().mockResolvedValue(undefined),
    markReviewed: vi.fn().mockResolvedValue(undefined),
  })
  useSettingsStore.setState({
    settings: { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'USD', monthly_budget: budget },
    isLoading: false,
    error: null,
    fetch: vi.fn().mockResolvedValue(undefined),
  })
  usePaymentStore.setState({
    calendarMonths: {},
    watchCalendarMonth: () => () => {},
    fetchCalendarMonth: vi.fn(async (year: number, month: number) => {
      const key = calendarMonthKey({ year, month })
      const monthOccurrences = occurrences.filter((o) => o.due_date.startsWith(key))
      usePaymentStore.setState((state) => ({
        calendarMonths: {
          ...state.calendarMonths,
          [key]: { occurrences: monthOccurrences, isLoading: false, error: null },
        },
      }))
      return monthOccurrences
    }),
  })
  render(<Dashboard />, { wrapper: MemoryRouter })
  return { fetch }
}

const region = (name: string) => screen.getByRole('region', { name })

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  invoke.mockImplementation(async (command: string) => {
    if (command === 'get_recent_price_changes') return []
    throw new Error(`Unexpected command: ${command}`)
  })
  useCategoryStore.setState({
    categories,
    isLoading: false,
    error: null,
    fetch: vi.fn().mockResolvedValue(undefined),
  })
  useUiStore.setState({ subscriptionDialogOpen: false, editingSubscriptionId: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Dashboard commitment summary', () => {
  it('shows one integrated monthly equivalent with a single currency-scope note', () => {
    renderDashboard(subscriptions)
    const summary = region('Monthly equivalent')

    expect(within(summary).getByText('$35.00')).toBeInTheDocument()
    expect(within(summary).getByText('/mo · your share')).toBeInTheDocument()
    expect(
      within(summary).getByText(
        '3 billable subscriptions in USD, including 1 trial at its recorded price.'
      )
    ).toBeInTheDocument()
    expect(
      screen.getAllByText(
        '1 subscription in JPY is not included. Kessai does not convert currencies.'
      )
    ).toHaveLength(1)
    // No KPI grid: the billed-monthly/yearly and due-this-week cards are gone.
    expect(screen.queryByRole('group', { name: 'Billed monthly' })).not.toBeInTheDocument()
    expect(screen.queryByText('Due this week')).not.toBeInTheDocument()
    expect(screen.queryByText('Spent')).not.toBeInTheDocument()
  })

  it('states the exact variance below, at, and above the monthly target', () => {
    renderDashboard(subscriptions, { budget: 100 })
    expect(
      within(region('Monthly equivalent')).getByText('$65.00 below target')
    ).toBeInTheDocument()
    cleanup()

    renderDashboard(subscriptions, { budget: 35 })
    expect(within(region('Monthly equivalent')).getByText('At target')).toBeInTheDocument()
    expect(screen.queryByText(/above target/)).not.toBeInTheDocument()
    cleanup()

    renderDashboard(subscriptions, { budget: 30 })
    const summary = region('Monthly equivalent')
    expect(within(summary).getByText('$5.00 above target')).toHaveClass('text-destructive')
    expect(within(summary).getByText('117% of target')).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: 'Review subscriptions' })).toHaveAttribute(
      'href',
      '/subscriptions'
    )
    expect(within(summary).getByRole('link', { name: 'Edit target' })).toHaveAttribute(
      'href',
      '/settings#budget'
    )
  })

  it('offers a quiet link instead of an empty meter when no target is set', () => {
    renderDashboard(subscriptions, { budget: null })
    const summary = region('Monthly equivalent')
    expect(within(summary).getByText(/No monthly target set/)).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: 'Set monthly target' })).toHaveAttribute(
      'href',
      '/settings#budget'
    )
  })

  it('folds the yearly equivalent and categories behind Breakdown', () => {
    renderDashboard(subscriptions)
    const summary = region('Monthly equivalent')
    expect(within(summary).queryByText('Yearly equivalent')).not.toBeInTheDocument()

    fireEvent.click(within(summary).getByRole('button', { name: 'Breakdown' }))

    expect(within(summary).getByText('Yearly equivalent')).toBeInTheDocument()
    expect(within(summary).getByText('$420.00')).toBeInTheDocument()
    const streaming = within(summary).getByText('Streaming').closest('li')!
    expect(within(streaming).getByText('$20.00')).toBeInTheDocument()
    expect(within(streaming).getByText('57%')).toBeInTheDocument()
  })
})

describe('Dashboard ledger and decisions', () => {
  it('lists the next 30 days of charges as full charges, without paused subscriptions', async () => {
    renderDashboard(subscriptions)
    const ledger = region('Upcoming charges')

    await waitFor(() => expect(within(ledger).getByText('Stream Club')).toBeInTheDocument())
    // $60 + $120 + $40 full charges; the JPY charge is listed but not added.
    expect(within(ledger).getByText('$220.00')).toBeInTheDocument()
    expect(within(ledger).getByText('1 charge in JPY is not in this total.')).toBeInTheDocument()
    const yen = within(ledger).getByText('Anime Box').closest('li')!
    expect(within(yen).getByText('JPY')).toBeInTheDocument()
    expect(yen).toHaveTextContent('1,500')
    expect(within(ledger).queryByText('Paused Radio')).not.toBeInTheDocument()
  })

  it('puts an ending trial in Decisions with Review and Keep', async () => {
    renderDashboard(subscriptions)
    const decisions = region('Decisions')
    const trial = within(decisions).getByText('Studio Gym').closest('li')!

    expect(within(trial).getByText('Trial ends in 2 days')).toBeInTheDocument()
    fireEvent.click(within(trial).getByRole('button', { name: 'Review Studio Gym' }))
    expect(useUiStore.getState()).toMatchObject({
      subscriptionDialogOpen: true,
      editingSubscriptionId: 'gym',
    })

    fireEvent.click(
      within(trial).getByRole('button', { name: 'Keep Studio Gym and record it as active' })
    )
    await waitFor(() =>
      expect(useSubscriptionStore.getState().transitionStatus).toHaveBeenCalledWith('gym', 'active')
    )
    // Phones and tablets preview the same decision above the ledger.
    expect(within(region('Needs a decision')).getByText('Studio Gym')).toBeInTheDocument()
  })

  it('lists only subscriptions unreviewed for 30 days as worth reviewing', async () => {
    renderDashboard([
      ...subscriptions,
      subscription({ id: 'old', name: 'Old News', amount: 12, created_at: daysAgo(45) }),
    ])
    const review = region('Worth reviewing')

    expect(within(review).getByText('Old News')).toBeInTheDocument()
    // Records added this week are not flooding the list.
    expect(within(review).queryByText('Stream Club')).not.toBeInTheDocument()
    fireEvent.click(
      within(review).getByRole('button', { name: 'Keep Old News and mark it reviewed' })
    )
    await waitFor(() =>
      expect(useSubscriptionStore.getState().markReviewed).toHaveBeenCalledWith('old')
    )
  })

  it('omits Worth reviewing and says no decisions are due when there are none', () => {
    renderDashboard(subscriptions.filter((s) => s.id !== 'gym'))
    expect(screen.queryByRole('region', { name: 'Worth reviewing' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Needs a decision' })).not.toBeInTheDocument()
    expect(
      within(region('Decisions')).getByText('No decisions due in the next 7 days.')
    ).toBeInTheDocument()
  })

  it('watches every month of the 30-day window', () => {
    renderDashboard(subscriptions)
    const fetchCalendarMonth = usePaymentStore.getState().fetchCalendarMonth
    for (const month of ledgerWindow(dayjs().format('YYYY-MM-DD')).months) {
      expect(fetchCalendarMonth).toHaveBeenCalledWith(month.year, month.month)
    }
  })
})

describe('Dashboard states', () => {
  it('says the load failed instead of showing zeros or "no charges"', () => {
    const { fetch } = renderDashboard([], { fetchError: 'Error: connection refused' })

    expect(screen.getByText('Couldn’t load your subscriptions')).toBeInTheDocument()
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument()
    expect(screen.queryByText('No charges scheduled in the next 30 days')).not.toBeInTheDocument()
    expect(screen.queryByText('No subscriptions yet')).not.toBeInTheDocument()
    fetch.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('greets a first run with Add and Import only, not an empty accounting surface', async () => {
    renderDashboard([])

    expect(await screen.findByRole('heading', { name: 'No subscriptions yet' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Import data' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Monthly equivalent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Upcoming charges' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Subscription' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add your first subscription' }))
    expect(useUiStore.getState()).toMatchObject({
      subscriptionDialogOpen: true,
      editingSubscriptionId: null,
    })
  })

  it('keeps the last list with a notice when a refresh fails', () => {
    renderDashboard(subscriptions, { fetchError: 'Error: timed out' })
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Couldn’t refresh your subscriptions. Showing what was last loaded.'
    )
    expect(within(region('Monthly equivalent')).getByText('$35.00')).toBeInTheDocument()
  })
})
