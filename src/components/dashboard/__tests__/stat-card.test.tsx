import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StatCard } from '../stat-card'

describe('StatCard', () => {
  it('groups the value under its label', () => {
    render(<StatCard label="Monthly cost" value="$42.00" />)

    const card = screen.getByRole('group', { name: 'Monthly cost' })
    expect(within(card).getByText('$42.00')).toBeInTheDocument()
  })

  it('shows the subtitle and the exclusion note when given', () => {
    render(
      <StatCard
        label="Monthly cost"
        value="$42.00"
        subtitle="3 subscriptions"
        note="Excludes 1 in EUR"
      />
    )

    const card = within(screen.getByRole('group', { name: 'Monthly cost' }))
    expect(card.getByText('3 subscriptions')).toBeInTheDocument()
    expect(card.getByText('Excludes 1 in EUR')).toBeInTheDocument()
  })

  it('renders nothing extra without a subtitle or note', () => {
    render(<StatCard label="Monthly cost" value="$42.00" />)

    const card = screen.getByRole('group', { name: 'Monthly cost' })
    expect(card.textContent).toBe('Monthly cost$42.00')
  })

  it('lets a long value wrap but never splits the unit (1.234,56 € /mo at 390px)', () => {
    render(<StatCard label="Monthly total" value="1.234,56 €" unit="/mo" />)

    const card = screen.getByRole('group', { name: 'Monthly total' })
    const unit = within(card).getByText('/mo')
    const value = within(card).getByText('1.234,56 €')
    const figure = value.parentElement!

    expect(unit).toHaveClass('whitespace-nowrap')
    expect(unit).not.toHaveClass('[overflow-wrap:anywhere]')
    expect(value).toHaveClass('[overflow-wrap:anywhere]')
    // Break-anywhere sits on the value only; the line may break at the space before the unit.
    expect(figure).not.toHaveClass('[overflow-wrap:anywhere]')
    expect(unit.parentElement).toBe(figure)
    expect(unit.previousSibling?.textContent).toBe(' ')
    expect(figure.textContent).toBe('1.234,56 € /mo')
  })
})
