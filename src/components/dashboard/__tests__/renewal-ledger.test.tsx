import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import { RenewalLedger } from '../renewal-ledger'
import { buildRenewalLedger } from '@/lib/renewal-ledger'
import { usePaymentStore } from '@/stores/payment-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useUiStore } from '@/stores/ui-store'
import type { CalendarOccurrence, Payment } from '@/types/payment'
import type { Subscription } from '@/types/subscription'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const TODAY = '2026-10-22'

const occurrence = (overrides: Partial<CalendarOccurrence>): CalendarOccurrence => ({
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

const kit = (due_date: string) =>
  occurrence({
    subscription_id: 'kit',
    name: 'Weekly Meal Kit',
    billing_cycle: 'weekly',
    projected_amount: 69,
    due_date,
  })

const OCCURRENCES = [
  occurrence({ subscription_id: 'github', name: 'GitHub Pro', projected_amount: 4 }),
  kit('2026-10-26'),
  occurrence({
    subscription_id: 'icloud',
    name: 'iCloud+',
    projected_amount: 9.99,
    due_date: '2026-10-28',
  }),
  occurrence({
    subscription_id: 'lessons',
    name: 'Japanese Lessons',
    currency: 'JPY',
    projected_amount: 3200,
    due_date: '2026-10-31',
  }),
  kit('2026-11-02'),
]

const SUBSCRIPTIONS = [{ id: 'kit', shared_count: 2, color: null } as Subscription]

const paymentFor =
  (status: Payment['status']) => (subscriptionId: string, dueDate: string, amount: number) =>
    Promise.resolve<Payment>({
      id: `pay-${subscriptionId}-${dueDate}`,
      subscription_id: subscriptionId,
      due_date: dueDate,
      amount,
      paid_at: '2026-10-22T12:00:00Z',
      status,
    })

function stubViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: wide, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
}

function renderLedger(
  occurrences = OCCURRENCES,
  props: Partial<Parameters<typeof RenewalLedger>[0]> = {}
) {
  const ledger = (list: CalendarOccurrence[]) =>
    buildRenewalLedger(list, { today: TODAY, displayCurrency: 'USD', subscriptions: SUBSCRIPTIONS })
  const element = (list: CalendarOccurrence[]) => (
    <MemoryRouter>
      <RenewalLedger
        ledger={ledger(list)}
        displayCurrency="USD"
        isLoading={false}
        error={null}
        onRetry={vi.fn().mockResolvedValue(undefined)}
        nextRenewal={null}
        {...props}
      />
    </MemoryRouter>
  )
  const view = render(element(occurrences))
  return { ...view, refresh: (list: CalendarOccurrence[]) => view.rerender(element(list)) }
}

const row = (name: string, index = 0) => screen.getAllByText(name)[index].closest('li')!

let fetchSubscriptions: Mock

beforeEach(() => {
  vi.clearAllMocks()
  stubViewport(true)
  fetchSubscriptions = vi.fn().mockResolvedValue(undefined)
  useSubscriptionStore.setState({ fetch: fetchSubscriptions })
  usePaymentStore.setState({
    markAsPaid: vi.fn(paymentFor('paid')),
    skipPayment: vi.fn(paymentFor('skipped')),
  })
  useUiStore.setState({ subscriptionDialogOpen: false, editingSubscriptionId: null })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('RenewalLedger', () => {
  it('labels the subtotal as full charges in the display currency and names what it leaves out', () => {
    renderLedger()
    const ledger = screen.getByRole('region', { name: 'Upcoming charges' })

    // 4 + 69 + 9.99 + 69: full charges, the same basis as the rows.
    expect(within(ledger).getByText('$151.99')).toBeInTheDocument()
    expect(within(ledger).getByText('USD full charges')).toBeInTheDocument()
    expect(within(ledger).getByText('1 charge in JPY is not in this total.')).toBeInTheDocument()
    expect(within(ledger).getByText(/5 charges/)).toBeInTheDocument()
    // The yen row stays visible with its own code.
    expect(within(row('Japanese Lessons')).getByText('JPY')).toBeInTheDocument()
  })

  it('shows the full charge of a shared plan with the user share beside it', () => {
    renderLedger()
    const meal = row('Weekly Meal Kit')
    expect(within(meal).getByText('$69.00')).toBeInTheDocument()
    expect(meal).toHaveTextContent('Your share $34.50 · split 2 ways')
  })

  it('records the full charge with Mark paid, shows the outcome and keeps focus on the row', async () => {
    let resolve!: (payment: Payment) => void
    const markAsPaid = vi.fn(
      () =>
        new Promise<Payment>((done) => {
          resolve = done
        })
    )
    usePaymentStore.setState({ markAsPaid })
    const { refresh } = renderLedger()

    const meal = row('Weekly Meal Kit')
    const button = within(meal).getByRole('button', { name: 'Mark paid' })
    expect(button).toHaveAccessibleDescription(/Weekly Meal Kit, due Monday, October 26/)
    button.focus()
    fireEvent.click(button)

    expect(markAsPaid).toHaveBeenCalledWith('kit', '2026-10-26', 69)
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(within(meal).getByRole('button', { name: 'Skip' })).toBeDisabled()

    await act(async () => {
      resolve({
        id: 'pay-1',
        subscription_id: 'kit',
        due_date: '2026-10-26',
        amount: 69,
        paid_at: '2026-10-22T12:00:00Z',
        status: 'paid',
      })
    })

    expect(within(meal).getByText('Marked paid')).toBeInTheDocument()
    expect(within(meal).queryByRole('button', { name: 'Mark paid' })).not.toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('Marked Weekly Meal Kit as paid', {
      description: 'Oct 26 · $69.00',
    })
    expect(fetchSubscriptions).toHaveBeenCalledOnce()
    await waitFor(() => expect(within(meal).getByText('Weekly Meal Kit')).toHaveFocus())

    // The refreshed schedule drops the paid occurrence: focus moves to the row after it.
    refresh(
      OCCURRENCES.filter((o) => !(o.subscription_id === 'kit' && o.due_date === '2026-10-26'))
    )
    expect(screen.getByText('iCloud+')).toHaveFocus()
  })

  it('skips an occurrence from the visible Skip button on wide rows', async () => {
    const skipPayment = usePaymentStore.getState().skipPayment
    renderLedger()

    fireEvent.click(within(row('GitHub Pro')).getByRole('button', { name: 'Skip' }))

    expect(skipPayment).toHaveBeenCalledWith('github', '2026-10-23', 4)
    await waitFor(() => expect(within(row('GitHub Pro')).getByText('Skipped')).toBeInTheDocument())
    expect(toast).toHaveBeenCalledWith('Skipped GitHub Pro', expect.objectContaining({}))
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('moves Skip into a 44px More menu on phones, beside a visible Mark paid', async () => {
    stubViewport(false)
    const skipPayment = usePaymentStore.getState().skipPayment
    renderLedger()
    const github = row('GitHub Pro')

    expect(within(github).getByRole('button', { name: 'Mark paid' })).toBeInTheDocument()
    expect(within(github).queryByRole('button', { name: 'Skip' })).not.toBeInTheDocument()
    const more = within(github).getByRole('button', { name: 'More actions for GitHub Pro, Oct 23' })
    expect(more).toHaveClass('max-sm:size-11')

    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Skip this payment' }))

    expect(skipPayment).toHaveBeenCalledWith('github', '2026-10-23', 4)
    await waitFor(() => expect(within(github).getByText('Skipped')).toBeInTheDocument())
  })

  it('opens the subscription editor from More', () => {
    renderLedger()
    fireEvent.click(
      within(row('iCloud+')).getByRole('button', { name: 'More actions for iCloud+, Oct 28' })
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit subscription' }))
    expect(useUiStore.getState()).toMatchObject({
      subscriptionDialogOpen: true,
      editingSubscriptionId: 'icloud',
    })
  })

  it('shows a failed write in the row and lets the user try again', async () => {
    usePaymentStore.setState({ markAsPaid: vi.fn().mockRejectedValue(new Error('offline')) })
    renderLedger()
    const github = row('GitHub Pro')

    fireEvent.click(within(github).getByRole('button', { name: 'Mark paid' }))

    expect(await within(github).findByRole('alert')).toHaveTextContent(
      'Couldn’t record this payment. offline'
    )
    expect(within(github).getByRole('button', { name: 'Mark paid' })).toBeEnabled()
    expect(within(github).queryByText('Marked paid')).not.toBeInTheDocument()
    expect(toast.error).toHaveBeenCalledWith("Couldn't record GitHub Pro", {
      description: 'offline',
    })
  })

  it('says when every charge in the period is in another currency instead of showing $0', () => {
    renderLedger([
      occurrence({
        subscription_id: 'eur',
        name: 'Euro Box',
        currency: 'EUR',
        projected_amount: 12,
      }),
      occurrence({
        subscription_id: 'eur',
        name: 'Euro Box',
        currency: 'EUR',
        projected_amount: 12,
        due_date: '2026-11-03',
      }),
    ])
    const ledger = screen.getByRole('region', { name: 'Upcoming charges' })

    expect(
      within(ledger).getByText('No USD charges in this period · 2 charges in EUR, not converted.')
    ).toBeInTheDocument()
    expect(within(ledger).queryByText('$0.00')).not.toBeInTheDocument()
    expect(within(ledger).getAllByText('Euro Box')).toHaveLength(2)
  })

  it('folds earlier unrecorded dates of this month into their own group', () => {
    renderLedger([
      occurrence({ subscription_id: 'spotify', name: 'Spotify', due_date: '2026-10-01' }),
      ...OCCURRENCES,
    ])
    const toggle = screen.getByRole('button', { name: /Earlier this month · no payment recorded/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveTextContent('1 due date before today, not in the total above')
    expect(screen.queryByText('Spotify')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    const earlier = screen.getByRole('list', { name: 'Earlier this month' })
    expect(within(earlier).getByText('Spotify')).toBeInTheDocument()
    expect(within(earlier).getByRole('button', { name: 'Mark paid' })).toBeInTheDocument()
    // Still the same upcoming total.
    expect(screen.getByText('$151.99')).toBeInTheDocument()
  })

  it('shows the first 6 charges and continues with View all', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      occurrence({
        subscription_id: `s${i}`,
        name: `Service ${i}`,
        due_date: `2026-10-${String(23 + i).padStart(2, '0')}`,
      })
    )
    renderLedger(many)

    expect(screen.queryByText('Service 6')).not.toBeInTheDocument()
    const more = screen.getByRole('button', { name: 'View all 8 charges' })
    fireEvent.click(more)
    expect(screen.getByText('Service 7')).toBeInTheDocument()
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(more).toHaveTextContent('Show fewer')
    // The subtotal covered the whole interval all along.
    expect(screen.getByText('$80.00')).toBeInTheDocument()
  })

  it('names the next renewal past the window when nothing is scheduled', () => {
    renderLedger([], {
      nextRenewal: { name: 'Notion Plus', next_payment_date: '2027-02-19' } as Subscription,
    })
    expect(screen.getByText('No charges scheduled in the next 30 days')).toBeInTheDocument()
    expect(
      screen.getByText('The next known renewal is Notion Plus on Feb 19, 2027.')
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open calendar' })).toHaveAttribute('href', '/calendar')
  })

  it('shows a schedule failure with Retry instead of an empty week', () => {
    const onRetry = vi.fn().mockResolvedValue(undefined)
    renderLedger(OCCURRENCES, { error: 'Error: offline', onRetry })

    expect(screen.getByText('Couldn’t load upcoming charges')).toBeInTheDocument()
    expect(screen.queryByText('No charges scheduled in the next 30 days')).not.toBeInTheDocument()
    expect(screen.queryByText('$151.99')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
