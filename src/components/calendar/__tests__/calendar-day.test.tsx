import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CalendarDay } from '../calendar-day'
import { formatCurrency } from '@/lib/currency'
import type { DayPayment } from '@/hooks/use-calendar-stats'

vi.mock('@/lib/logo-storage', () => ({
  getLogoDataUrl: vi.fn().mockResolvedValue(null),
}))

const makePayment = (
  name: string,
  overrides: Partial<DayPayment> = {},
  currency = 'USD'
): DayPayment => ({
  subscription: {
    id: name.toLowerCase(),
    name,
    currency,
    billing_cycle: 'monthly',
    category_id: null,
    status: 'active',
    is_active: true,
    logo_url: null,
    color: '#8b5cf6',
  },
  amount: 15.99,
  isPaid: false,
  isSkipped: false,
  dueDate: '2026-03-15',
  ...overrides,
})

const october4 = new Date(2026, 9, 4)

function renderDay(props: Partial<React.ComponentProps<typeof CalendarDay>> = {}) {
  const onSelect = vi.fn()
  render(
    <CalendarDay
      date={october4}
      isToday={false}
      isSelected={false}
      payments={[]}
      displayCurrency="USD"
      onSelect={onSelect}
      {...props}
    />
  )
  return { onSelect }
}

describe('CalendarDay', () => {
  it('names an empty day and selects it on click', () => {
    const { onSelect } = renderDay()

    const day = screen.getByRole('button', { name: 'Sunday, October 4, no payments' })
    expect(day).toHaveTextContent('4')
    fireEvent.click(day)
    expect(onSelect).toHaveBeenCalledWith(october4)
  })

  it('lists payment names in ink beside the logo', () => {
    renderDay({ payments: [makePayment('Netflix'), makePayment('Spotify')] })

    expect(screen.getByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getByText('Netflix')).not.toHaveAttribute('style')
  })

  it('shows two entries and collapses the rest into "+N more"', () => {
    renderDay({
      payments: ['Sub1', 'Sub2', 'Sub3', 'Sub4'].map((name) => makePayment(name)),
    })

    expect(screen.getByText('Sub2')).toBeInTheDocument()
    expect(screen.queryByText('Sub3')).not.toBeInTheDocument()
    expect(screen.getByText('+2 more')).toBeInTheDocument()
  })

  it('labels the day with its count, per-currency totals, and paid payments', () => {
    renderDay({
      payments: [
        makePayment('Netflix', { amount: 22.99, isPaid: true }),
        makePayment('Spotify', { amount: 50 }),
        makePayment('Lessons', { amount: 3200 }, 'JPY'),
      ],
    })

    expect(
      screen.getByRole('button', {
        name: `Sunday, October 4, 3 payments, $72.99 + ${formatCurrency(3200, 'JPY')}, 1 paid`,
      })
    ).toBeInTheDocument()
  })

  it('names skipped payments in the day label', () => {
    renderDay({
      payments: [
        makePayment('Headspace', { amount: 5, isSkipped: true }),
        makePayment('Netflix', { amount: 22.99, isPaid: true }),
      ],
    })

    expect(
      screen.getByRole('button', {
        name: 'Sunday, October 4, 2 payments, $27.99, 1 paid, 1 skipped',
      })
    ).toBeInTheDocument()
  })

  it('tints recorded phone dots 70% on paper and 40% on obsidian', () => {
    renderDay({
      payments: [makePayment('Netflix', { isPaid: true }), makePayment('Spotify')],
    })

    const recorded = document.querySelectorAll('[data-recorded]')
    expect(recorded).toHaveLength(1)
    expect(recorded[0]).toHaveClass('bg-muted-foreground/70', 'dark:bg-muted-foreground/40')
  })

  it('marks today as the current date', () => {
    renderDay({ isToday: true })

    const day = screen.getByRole('button', { name: /^Sunday, October 4, today/ })
    expect(day).toHaveAttribute('aria-current', 'date')
  })

  it('does not mark other days as current', () => {
    renderDay()

    expect(screen.getByRole('button')).not.toHaveAttribute('aria-current')
  })
})
