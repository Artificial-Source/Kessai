import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetWidget } from '../budget-widget'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('BudgetWidget', () => {
  it('renders Monthly Budget heading', () => {
    render(<BudgetWidget budget={100} currentSpend={50} currency="USD" />)

    expect(screen.getByText('Monthly Budget')).toBeInTheDocument()
  })

  it('renders normal budget state (under 80%)', () => {
    render(<BudgetWidget budget={200} currentSpend={100} currency="USD" />)

    expect(screen.getByText('50%')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
  })

  it('renders warning state (over 80%)', () => {
    render(<BudgetWidget budget={100} currentSpend={85} currency="USD" />)

    expect(screen.getByText('85%')).toBeInTheDocument()
    expect(screen.getByText('Remaining')).toBeInTheDocument()
  })

  it('renders over-budget state (over 100%)', () => {
    render(<BudgetWidget budget={100} currentSpend={150} currency="USD" />)

    // Percentage is capped at 100 visually but text shows 100%
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('Over by')).toBeInTheDocument()
  })

  it('renders spent and budget labels', () => {
    render(<BudgetWidget budget={200} currentSpend={80} currency="USD" />)

    expect(screen.getByText('Spent')).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
  })

  it('renders currency values', () => {
    render(<BudgetWidget budget={200} currentSpend={80} currency="USD" />)

    // Should show formatted currency amounts
    expect(screen.getByText('$80.00')).toBeInTheDocument()
    expect(screen.getByText('$200.00')).toBeInTheDocument()
  })
})
