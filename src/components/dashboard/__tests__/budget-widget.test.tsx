import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { BudgetWidget } from '../budget-widget'

const budgetSection = () => screen.getByRole('region', { name: 'Monthly budget' })

describe('BudgetWidget', () => {
  it('is a named section with a labelled progress bar', () => {
    render(<BudgetWidget budget={200} currentSpend={100} currency="USD" />)

    expect(budgetSection()).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Monthly budget used' })).toHaveAttribute(
      'aria-valuenow',
      '50'
    )
  })

  it('shows spent, budget, and what remains under budget', () => {
    render(<BudgetWidget budget={200} currentSpend={80} currency="USD" />)

    const section = within(budgetSection())
    expect(section.getByText('40%')).toBeInTheDocument()
    expect(section.getByText('Spent').nextElementSibling).toHaveTextContent('$80.00')
    expect(section.getByText('Budget').nextElementSibling).toHaveTextContent('$200.00')
    expect(section.getByText('Remaining').nextElementSibling).toHaveTextContent('$120.00')
  })

  it('states the true percentage and the overage when over budget, with the bar capped', () => {
    render(<BudgetWidget budget={100} currentSpend={150} currency="USD" />)

    const section = within(budgetSection())
    expect(section.getByText('150%')).toBeInTheDocument()
    expect(section.getByText('Over by').nextElementSibling).toHaveTextContent('$50.00')
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('carries the currency exclusion note when given', () => {
    render(<BudgetWidget budget={100} currentSpend={50} currency="USD" note="Excludes 1 in EUR" />)

    expect(within(budgetSection()).getByText('Excludes 1 in EUR')).toBeInTheDocument()
  })
})
