import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import type { PaymentCard } from '@/types/payment-card'
import type * as ApiModule from '@/lib/api'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { CardManager } from '../card-manager'

const visa: PaymentCard = {
  id: 'card-visa',
  name: 'Everyday Visa',
  card_type: 'credit',
  last_four: '4821',
  color: '#3b82f6',
  credit_limit: 2500,
  created_at: '2024-01-01T00:00:00.000Z',
}

beforeEach(() => {
  invoke.mockReset()
  invoke.mockImplementation(async (command: string, args?: { data?: Partial<PaymentCard> }) => {
    switch (command) {
      case 'list_payment_cards':
        return [visa]
      case 'update_payment_card':
        return { ...visa, ...args?.data }
      default:
        throw new Error(`Unexpected command: ${command}`)
    }
  })
  usePaymentCardStore.setState({ cards: [], isLoading: false, error: null })
})

afterEach(cleanup)

describe('CardManager', () => {
  it('clears last four digits and the limit with null when an edit empties them', async () => {
    render(<CardManager currency="USD" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Everyday Visa' }))
    const lastFour = screen.getByRole('textbox', { name: /Last 4 digits/ })
    const limit = screen.getByRole('spinbutton', { name: /Monthly limit/ })
    expect(lastFour).toHaveValue('4821')
    expect(limit).toHaveValue(2500)

    fireEvent.change(lastFour, { target: { value: '' } })
    fireEvent.change(limit, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('update_payment_card', {
        id: 'card-visa',
        data: expect.objectContaining({
          name: 'Everyday Visa',
          card_type: 'credit',
          last_four: null,
          credit_limit: null,
        }),
      })
    )
    // The form closes once the store accepts the edit.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Save card' })).not.toBeInTheDocument()
    )
  })

  it('keeps filled optional fields on an edit', async () => {
    render(<CardManager currency="USD" />)

    fireEvent.click(await screen.findByRole('button', { name: 'Edit Everyday Visa' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: /Monthly limit/ }), {
      target: { value: '3000' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save card' }))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('update_payment_card', {
        id: 'card-visa',
        data: expect.objectContaining({ last_four: '4821', credit_limit: 3000 }),
      })
    )
  })
})
