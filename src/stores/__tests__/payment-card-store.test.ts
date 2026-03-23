import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePaymentCardStore } from '../payment-card-store'

const mockInvoke = vi.fn()

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

const mockCards = [
  {
    id: 'card-1',
    name: 'Visa Platinum',
    card_type: 'credit' as const,
    last_four: '4242',
    color: '#3b82f6',
    credit_limit: 5000,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'card-2',
    name: 'Debit Card',
    card_type: 'debit' as const,
    last_four: '1234',
    color: '#10b981',
    credit_limit: null,
    created_at: '2024-01-15T00:00:00.000Z',
  },
]

describe('usePaymentCardStore', () => {
  beforeEach(() => {
    usePaymentCardStore.setState({
      cards: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('fetches cards and updates state', async () => {
      mockInvoke.mockResolvedValue(mockCards)

      await usePaymentCardStore.getState().fetch()

      expect(mockInvoke).toHaveBeenCalledWith('list_payment_cards')
      const state = usePaymentCardStore.getState()
      expect(state.cards).toHaveLength(2)
      expect(state.cards[0].name).toBe('Visa Platinum')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets loading state during fetch', async () => {
      mockInvoke.mockResolvedValue(mockCards)

      const fetchPromise = usePaymentCardStore.getState().fetch()
      expect(usePaymentCardStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(usePaymentCardStore.getState().isLoading).toBe(false)
    })

    it('handles fetch errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await usePaymentCardStore.getState().fetch()

      const state = usePaymentCardStore.getState()
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('add', () => {
    it('adds a new card and updates state', async () => {
      const newCard = {
        id: 'card-3',
        name: 'Amex Gold',
        card_type: 'credit' as const,
        last_four: '9999',
        color: '#f59e0b',
        credit_limit: 10000,
        created_at: '2024-02-01T00:00:00.000Z',
      }
      mockInvoke.mockResolvedValue(newCard)

      const result = await usePaymentCardStore.getState().add({
        name: 'Amex Gold',
        card_type: 'credit',
        last_four: '9999',
        color: '#f59e0b',
        credit_limit: 10000,
      })

      expect(mockInvoke).toHaveBeenCalledWith('create_payment_card', {
        data: {
          name: 'Amex Gold',
          card_type: 'credit',
          last_four: '9999',
          color: '#f59e0b',
          credit_limit: 10000,
        },
      })
      expect(result).toEqual(newCard)
      expect(usePaymentCardStore.getState().cards).toHaveLength(1)
    })

    it('sends null for empty last_four', async () => {
      const newCard = {
        id: 'card-3',
        name: 'Test Card',
        card_type: 'debit' as const,
        last_four: null,
        color: '#6b7280',
        credit_limit: null,
        created_at: '2024-02-01T00:00:00.000Z',
      }
      mockInvoke.mockResolvedValue(newCard)

      await usePaymentCardStore.getState().add({
        name: 'Test Card',
        card_type: 'debit',
        last_four: '',
        color: '#6b7280',
      })

      expect(mockInvoke).toHaveBeenCalledWith('create_payment_card', {
        data: expect.objectContaining({ last_four: null }),
      })
    })
  })

  describe('update', () => {
    beforeEach(() => {
      usePaymentCardStore.setState({ cards: [...mockCards] })
    })

    it('updates a card and replaces it in state', async () => {
      const updated = { ...mockCards[0], name: 'Visa Signature' }
      mockInvoke.mockResolvedValue(updated)

      await usePaymentCardStore.getState().update('card-1', { name: 'Visa Signature' })

      expect(mockInvoke).toHaveBeenCalledWith('update_payment_card', {
        id: 'card-1',
        data: { name: 'Visa Signature' },
      })
      expect(usePaymentCardStore.getState().cards.find((c) => c.id === 'card-1')?.name).toBe(
        'Visa Signature'
      )
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      usePaymentCardStore.setState({ cards: [...mockCards] })
    })

    it('removes a card from state', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await usePaymentCardStore.getState().remove('card-1')

      expect(mockInvoke).toHaveBeenCalledWith('delete_payment_card', { id: 'card-1' })
      const state = usePaymentCardStore.getState()
      expect(state.cards).toHaveLength(1)
      expect(state.cards.some((c) => c.id === 'card-1')).toBe(false)
    })
  })

  describe('getCard', () => {
    beforeEach(() => {
      usePaymentCardStore.setState({ cards: [...mockCards] })
    })

    it('returns card by id', () => {
      const card = usePaymentCardStore.getState().getCard('card-1')
      expect(card).toBeDefined()
      expect(card?.name).toBe('Visa Platinum')
    })

    it('returns undefined for non-existent id', () => {
      const card = usePaymentCardStore.getState().getCard('non-existent')
      expect(card).toBeUndefined()
    })

    it('returns undefined for null id', () => {
      const card = usePaymentCardStore.getState().getCard(null)
      expect(card).toBeUndefined()
    })

    it('returns undefined for undefined id', () => {
      const card = usePaymentCardStore.getState().getCard(undefined)
      expect(card).toBeUndefined()
    })
  })

  describe('add error handling', () => {
    it('throws error and does not add card on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Create failed'))

      await expect(
        usePaymentCardStore.getState().add({
          name: 'Failed Card',
          card_type: 'credit',
          last_four: '0000',
          color: '#000000',
        })
      ).rejects.toThrow('Create failed')

      expect(usePaymentCardStore.getState().cards).toEqual([])
    })
  })

  describe('update error handling', () => {
    beforeEach(() => {
      usePaymentCardStore.setState({ cards: [...mockCards] })
    })

    it('rolls back on update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(
        usePaymentCardStore.getState().update('card-1', { name: 'Failed Update' })
      ).rejects.toThrow('Update failed')

      const card = usePaymentCardStore.getState().cards.find((c) => c.id === 'card-1')
      expect(card?.name).toBe('Visa Platinum')
    })
  })

  describe('remove error handling', () => {
    beforeEach(() => {
      usePaymentCardStore.setState({ cards: [...mockCards] })
    })

    it('rolls back on remove failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'))

      await expect(usePaymentCardStore.getState().remove('card-1')).rejects.toThrow('Delete failed')

      expect(usePaymentCardStore.getState().cards).toHaveLength(2)
      expect(usePaymentCardStore.getState().cards.some((c) => c.id === 'card-1')).toBe(true)
    })
  })
})
