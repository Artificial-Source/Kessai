import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CalendarDay } from '../calendar-day'
import type { DayPayment } from '@/hooks/use-calendar-stats'
import type { Subscription } from '@/types/subscription'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/logo-storage', () => ({
  getLogoDataUrl: vi.fn().mockResolvedValue(null),
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

const makePayment = (overrides: Partial<DayPayment> = {}): DayPayment => ({
  subscription: makeSub(),
  amount: 15.99,
  isPaid: false,
  isSkipped: false,
  dueDate: '2026-03-15',
  ...overrides,
})

const defaultProps = {
  isCurrentMonth: true,
  isToday: false,
  isSelected: false,
  payments: [],
  totalAmount: 0,
  currency: 'USD' as const,
  onClick: vi.fn(),
}

describe('CalendarDay', () => {
  it('renders the day number', () => {
    render(<CalendarDay {...defaultProps} dayOfMonth={15} />)

    expect(screen.getByText('15')).toBeInTheDocument()
  })

  it('handles no payments', () => {
    render(<CalendarDay {...defaultProps} dayOfMonth={5} payments={[]} />)

    expect(screen.getByText('5')).toBeInTheDocument()
    // No payment items rendered
    expect(screen.queryByText('Netflix')).not.toBeInTheDocument()
  })

  it('shows payment items', () => {
    const payments = [makePayment()]

    render(
      <CalendarDay {...defaultProps} dayOfMonth={15} payments={payments} totalAmount={15.99} />
    )

    expect(screen.getByText('Netflix')).toBeInTheDocument()
  })

  it('shows today indicator with ring styles', () => {
    render(<CalendarDay {...defaultProps} dayOfMonth={20} isToday={true} />)

    const dayNum = screen.getByText('20')
    // Today indicator applies bg-primary class
    expect(dayNum).toHaveClass('bg-primary')
  })

  it('does not show today indicator for non-today', () => {
    render(<CalendarDay {...defaultProps} dayOfMonth={10} isToday={false} />)

    const dayNum = screen.getByText('10')
    expect(dayNum).not.toHaveClass('bg-primary')
  })

  it('shows multiple payments', () => {
    const payments = [
      makePayment({ subscription: makeSub({ id: 'sub-1', name: 'Netflix' }) }),
      makePayment({
        subscription: makeSub({ id: 'sub-2', name: 'Spotify' }),
        dueDate: '2026-03-15',
      }),
    ]

    render(<CalendarDay {...defaultProps} dayOfMonth={15} payments={payments} totalAmount={30} />)

    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
  })

  it('shows +N more when more than 3 payments', () => {
    const payments = [
      makePayment({ subscription: makeSub({ id: 'sub-1', name: 'Sub1' }) }),
      makePayment({ subscription: makeSub({ id: 'sub-2', name: 'Sub2' }), dueDate: '2026-03-16' }),
      makePayment({ subscription: makeSub({ id: 'sub-3', name: 'Sub3' }), dueDate: '2026-03-17' }),
      makePayment({ subscription: makeSub({ id: 'sub-4', name: 'Sub4' }), dueDate: '2026-03-18' }),
    ]

    render(<CalendarDay {...defaultProps} dayOfMonth={15} payments={payments} totalAmount={60} />)

    expect(screen.getByText('+1 more')).toBeInTheDocument()
  })

  it('has correct aria-label with payment count', () => {
    const payments = [makePayment()]

    render(
      <CalendarDay {...defaultProps} dayOfMonth={15} payments={payments} totalAmount={15.99} />
    )

    expect(screen.getByRole('button', { name: /15, 1 payment/ })).toBeInTheDocument()
  })
})
