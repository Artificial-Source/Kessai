import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UpcomingPaymentRow } from '../upcoming-payment-row'

function renderRow(currency: string) {
  render(
    <ul>
      <UpcomingPaymentRow
        subscription={{ id: 'sub-1', name: 'Kagi', amount: 4, currency, logo_url: null }}
        currency="USD"
      />
    </ul>
  )
  return screen.getByRole('listitem')
}

describe('UpcomingPaymentRow', () => {
  it('shows an amount in the display currency without a currency code', () => {
    const row = renderRow('USD')

    expect(row).toHaveTextContent('$4.00')
    expect(row).not.toHaveTextContent('USD')
  })

  it('labels an amount in another currency with its code', () => {
    const row = renderRow('EUR')

    expect(row).toHaveTextContent('EUR')
  })
})
