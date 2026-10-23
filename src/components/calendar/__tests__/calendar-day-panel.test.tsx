import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { CalendarDayPanel } from '../calendar-day-panel'
import { formatCurrency } from '@/lib/currency'
import type { DayPayment } from '@/hooks/use-calendar-stats'
import type { Payment } from '@/types/payment'

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}))

const occurrence = (id: string, name: string): DayPayment => ({
  subscription: {
    id,
    name,
    currency: 'USD',
    billing_cycle: 'monthly',
    category_id: null,
    status: 'active',
    is_active: true,
    logo_url: null,
  },
  amount: 12,
  isPaid: false,
  isSkipped: false,
  dueDate: '2026-10-10',
})

const recorded: Payment = {
  id: 'payment',
  subscription_id: 'one',
  due_date: '2026-10-10',
  paid_at: '2026-10-10T12:00:00Z',
  amount: 12,
  status: 'paid',
}

describe('CalendarDayPanel payment actions', () => {
  it('awaits all outcomes, prevents re-entry, reports partial failures, and refreshes once', async () => {
    let resolveFirst!: (payment: Payment) => void
    const first = new Promise<Payment>((resolve) => {
      resolveFirst = resolve
    })
    const onMarkPaid = vi
      .fn()
      .mockReturnValueOnce(first)
      .mockRejectedValueOnce(new Error('Payment conflict'))
    const onRefresh = vi.fn().mockResolvedValue(undefined)

    render(
      <CalendarDayPanel
        isOpen
        selectedDate={new Date(2026, 9, 10)}
        payments={[occurrence('one', 'Netflix'), occurrence('two', 'Spotify')]}
        onClose={vi.fn()}
        onMarkPaid={onMarkPaid}
        onSkip={vi.fn().mockResolvedValue(recorded)}
        onEdit={vi.fn()}
        onRefresh={onRefresh}
      />
    )

    const bulk = screen.getByRole('button', { name: 'Mark all as paid' })
    fireEvent.click(bulk)
    fireEvent.click(bulk)
    expect(onMarkPaid).toHaveBeenCalledTimes(2)
    expect(bulk).toBeDisabled()
    expect(onRefresh).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()

    await act(async () => {
      resolveFirst(recorded)
      await first
    })
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1))
    expect(toast.error).toHaveBeenCalledWith('Marked 1 of 2 payments as paid', {
      description: 'Spotify: Payment conflict.',
    })
  })

  it('reports the returned outcome rather than claiming every mark-paid call succeeded', async () => {
    vi.mocked(toast.success).mockClear()
    render(
      <CalendarDayPanel
        isOpen
        selectedDate={new Date(2026, 9, 10)}
        payments={[occurrence('one', 'Netflix')]}
        onClose={vi.fn()}
        onMarkPaid={vi.fn().mockResolvedValue({ ...recorded, status: 'skipped' })}
        onSkip={vi.fn().mockResolvedValue(recorded)}
        onEdit={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark paid' }))
    // A skip is reported neutrally, never with the success check.
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith('Skipped Netflix', {
        description: undefined,
        icon: expect.anything(),
      })
    )
    expect(toast.success).not.toHaveBeenCalled()
  })

  it.each([
    { isLoading: true, error: null, message: 'Loading payments…' },
    {
      isLoading: false,
      error: 'Unavailable',
      message: 'Couldn’t load payments for this day. Retry from the calendar.',
    },
  ])(
    'does not show an empty day while the month is unavailable ($message)',
    ({ isLoading, error, message }) => {
      render(
        <CalendarDayPanel
          isOpen
          selectedDate={new Date(2026, 9, 10)}
          payments={[]}
          isLoading={isLoading}
          error={error}
          onClose={vi.fn()}
          onMarkPaid={vi.fn()}
          onSkip={vi.fn()}
          onEdit={vi.fn()}
          onRefresh={vi.fn()}
        />
      )
      expect(screen.getByText(message)).toBeInTheDocument()
      expect(screen.queryByText('No payments due')).not.toBeInTheDocument()
      expect(screen.queryByText('0 payments due')).not.toBeInTheDocument()
    }
  )

  it('confirms a full mark-all with the count of payments marked', async () => {
    render(
      <CalendarDayPanel
        isOpen
        selectedDate={new Date(2026, 9, 10)}
        payments={[occurrence('one', 'Netflix'), occurrence('two', 'Spotify')]}
        onClose={vi.fn()}
        onMarkPaid={vi.fn().mockResolvedValue(recorded)}
        onSkip={vi.fn()}
        onEdit={vi.fn()}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as paid' }))
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Marked 2 payments as paid', {
        description: undefined,
      })
    )
  })

  it('opens as a titled dialog below the side-panel breakpoint and notes other currencies', () => {
    const onClose = vi.fn()
    const yen = occurrence('three', 'Lessons')
    yen.subscription.currency = 'JPY'
    yen.amount = 3200
    render(
      <CalendarDayPanel
        layout="dialog"
        isOpen
        selectedDate={new Date(2026, 9, 10)}
        payments={[occurrence('one', 'Netflix'), yen]}
        currency="USD"
        onClose={onClose}
        onMarkPaid={vi.fn()}
        onSkip={vi.fn()}
        onEdit={vi.fn()}
        onRefresh={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'Saturday, October 10' })
    expect(dialog).toHaveAccessibleDescription('2 payments · $12.00 · 2 due')
    expect(screen.getByText('Excludes 1 in JPY')).toBeInTheDocument()
    expect(screen.getByText(formatCurrency(3200, 'JPY'))).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
  })
})
