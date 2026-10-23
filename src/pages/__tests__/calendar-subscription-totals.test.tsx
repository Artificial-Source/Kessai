import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../dashboard'
import { Subscriptions } from '../subscriptions'
import { CalendarPage } from '../calendar'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { useTagStore } from '@/stores/tag-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Subscription } from '@/types/subscription'
import type * as ApiModule from '@/lib/api'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/subscriptions/subscription-dialog', () => ({
  SubscriptionDialog: () => null,
}))
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }))
vi.mock('@/components/subscriptions/cancel-dialog', () => ({ CancelDialog: () => null }))

const subscription = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'monthly',
  name: 'Shared monthly',
  amount: 60,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 10,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: '2020-01-10',
  status: 'active',
  shared_count: 6,
  is_pinned: false,
  created_at: '2020-01-01T00:00:00Z',
  updated_at: '2020-01-01T00:00:00Z',
  ...overrides,
})

let subscriptions: Subscription[]
let calendarError: Error | null
let paymentStatus: 'paid' | 'skipped'
let advanceSchedule: boolean

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  subscriptions = [
    subscription(),
    subscription({
      id: 'yearly',
      name: 'Shared yearly',
      amount: 120,
      billing_cycle: 'yearly',
      shared_count: 2,
    }),
    subscription({ id: 'yen', name: 'Japanese subscription', currency: 'JPY', amount: 600 }),
    subscription({ id: 'paused', status: 'paused', amount: 999 }),
  ]
  calendarError = null
  paymentStatus = 'paid'
  advanceSchedule = true
  const settings = { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'USD' }
  useSubscriptionStore.setState({ subscriptions: [], isLoading: false, error: null })
  useCategoryStore.setState({ categories: [], isLoading: false, error: null })
  useSettingsStore.setState({ settings, isLoading: false, error: null })
  usePaymentStore.setState({ payments: [], calendarMonths: {}, isLoading: false, error: null })
  useTagStore.setState({ tags: [], isLoading: false, error: null })
  useUiStore.setState({ costNormalization: 'monthly' })
  invoke.mockImplementation(async (command: string) => {
    switch (command) {
      case 'list_subscriptions':
        return subscriptions
      case 'get_settings':
        return settings
      case 'list_subscription_tags_batch':
        return {}
      case 'list_categories':
      case 'list_tags':
        return []
      case 'list_calendar_payments':
        if (calendarError) throw calendarError
        return []
      case 'get_recent_price_changes':
        return []
      case 'mark_payment_paid':
        if (advanceSchedule)
          subscriptions = subscriptions.map((sub) =>
            sub.id === 'monthly' ? { ...sub, next_payment_date: '2020-02-10' } : sub
          )
        return {
          id: 'paid',
          subscription_id: 'monthly',
          due_date: '2020-01-10',
          paid_at: '2020-01-10T12:00:00Z',
          amount: 60,
          status: paymentStatus,
        }
      default:
        throw new Error(`Unexpected command: ${command}`)
    }
  })
})

describe('canonical frontend totals and payment outcomes', () => {
  it('shows identical monthly user-share totals on dashboard and subscriptions, excluding JPY', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    )
    const dashboard = render(<Dashboard />, { wrapper: MemoryRouter })
    const summary = await screen.findByRole('region', { name: 'Monthly equivalent' })
    await waitFor(() => expect(within(summary).getByText('$15.00')).toBeInTheDocument())
    expect(
      within(summary).getByText(
        '1 subscription in JPY is not included. Kessai does not convert currencies.'
      )
    ).toBeInTheDocument()
    dashboard.unmount()
    vi.unstubAllGlobals()

    render(<Subscriptions />, { wrapper: MemoryRouter })
    const heading = await screen.findByRole('heading', { name: 'My Subscriptions' })
    const header = within(heading.closest('header')!)
    expect(header.getByText('Monthly total')).toBeInTheDocument()
    expect(header.getByText('$15.00/mo')).toBeInTheDocument()
    expect(screen.getByText('Excludes 1 in JPY')).toBeInTheDocument()
  })

  it('records payment without writing a computed next date and reports the refreshed schedule', async () => {
    localStorage.setItem('kessai-view-mode', 'grid')
    render(<Subscriptions />, { wrapper: MemoryRouter })
    const markPaid = await screen.findAllByRole('button', { name: /Mark.*paid/i })
    fireEvent.click(markPaid[0])
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Payment recorded', {
        description: expect.stringContaining('Schedule advanced. Next payment:'),
      })
    )
    expect(invoke).toHaveBeenCalledWith('mark_payment_paid', {
      subscriptionId: 'monthly',
      dueDate: '2020-01-10',
      amount: 60,
    })
    expect(invoke.mock.calls.some(([command]) => command === 'update_subscription')).toBe(false)
    expect(
      useSubscriptionStore.getState().subscriptions.find((sub) => sub.id === 'monthly')
        ?.next_payment_date
    ).toBe('2020-02-10')
    expect(invoke).toHaveBeenCalledWith('list_calendar_payments', { year: 2020, month: 1 })
  })

  it.each(['paid', 'skipped'] as const)(
    'does not claim schedule advancement for a returned %s outcome without a changed date',
    async (status) => {
      localStorage.setItem('kessai-view-mode', 'grid')
      paymentStatus = status
      advanceSchedule = false
      render(<Subscriptions />, { wrapper: MemoryRouter })
      fireEvent.click((await screen.findAllByRole('button', { name: /Mark.*paid/i }))[0])
      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          status === 'skipped' ? 'Payment skipped' : 'Payment recorded',
          { description: `Shared monthly: payment ${status}.` }
        )
      )
      expect(invoke.mock.calls.some(([command]) => command === 'update_subscription')).toBe(false)
    }
  )

  it('shows a month error instead of zero summary data or an empty grid', async () => {
    cleanup()
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
    )
    calendarError = new Error('Calendar unavailable')
    render(<CalendarPage />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/Couldn’t load \w+ \d{4}/)
    expect(alert).toHaveTextContent('Error: Calendar unavailable')
    expect(screen.queryByText('0 payments')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /no payments/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
