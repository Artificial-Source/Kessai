import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePaymentStore } from '../payment-store'

// Mock data
const mockPayments = [
  {
    id: 'pay-1',
    subscription_id: 'sub-1',
    amount: 15.99,
    paid_at: '2024-01-15T10:00:00.000Z',
    due_date: '2024-01-15',
    status: 'paid' as const,
    notes: null,
    created_at: '2024-01-15T10:00:00.000Z',
  },
  {
    id: 'pay-2',
    subscription_id: 'sub-2',
    amount: 9.99,
    paid_at: '2024-01-20T10:00:00.000Z',
    due_date: '2024-01-20',
    status: 'paid' as const,
    notes: 'Monthly payment',
    created_at: '2024-01-20T10:00:00.000Z',
  },
  {
    id: 'pay-3',
    subscription_id: 'sub-1',
    amount: 15.99,
    paid_at: '2024-02-15T10:00:00.000Z',
    due_date: '2024-02-15',
    status: 'skipped' as const,
    notes: null,
    created_at: '2024-02-15T10:00:00.000Z',
  },
]

const mockPaymentsWithDetails = [
  {
    ...mockPayments[0],
    subscription_name: 'Netflix',
    subscription_color: '#e50914',
    category_name: 'Entertainment',
    category_color: '#8655f6',
  },
]

const mockSelect = vi.fn()
const mockExecute = vi.fn()

vi.mock('@/lib/database', () => ({
  getDatabase: () =>
    Promise.resolve({
      select: (...args: unknown[]) => mockSelect(...args),
      execute: (...args: unknown[]) => mockExecute(...args),
    }),
}))

describe('usePaymentStore', () => {
  beforeEach(() => {
    // Reset store state
    usePaymentStore.setState({
      payments: [],
      isLoading: false,
      error: null,
    })

    // Reset mocks
    vi.clearAllMocks()
    mockSelect.mockResolvedValue(mockPayments)
    mockExecute.mockResolvedValue(undefined)
  })

  describe('fetchPayments', () => {
    it('fetches payments and updates state', async () => {
      await usePaymentStore.getState().fetchPayments()

      expect(mockSelect).toHaveBeenCalledWith('SELECT * FROM payments ORDER BY paid_at DESC')
      const state = usePaymentStore.getState()
      expect(state.payments).toHaveLength(3)
      expect(state.payments[0].id).toBe('pay-1')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets loading state during fetch', async () => {
      const fetchPromise = usePaymentStore.getState().fetchPayments()

      expect(usePaymentStore.getState().isLoading).toBe(true)

      await fetchPromise

      expect(usePaymentStore.getState().isLoading).toBe(false)
    })

    it('handles fetch errors', async () => {
      mockSelect.mockRejectedValue(new Error('Database error'))

      await usePaymentStore.getState().fetchPayments()

      const state = usePaymentStore.getState()
      expect(state.error).toBe('Database error')
      expect(state.isLoading).toBe(false)
      expect(state.payments).toEqual([])
    })
  })

  describe('fetchPaymentsByMonth', () => {
    it('fetches payments for a specific month', async () => {
      mockSelect.mockResolvedValue([mockPayments[0], mockPayments[1]])

      const result = await usePaymentStore.getState().fetchPaymentsByMonth(2024, 1)

      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining('WHERE due_date >= ? AND due_date < ?'),
        ['2024-01-01', '2024-02-01']
      )
      expect(result).toHaveLength(2)
    })

    it('handles month boundary correctly', async () => {
      mockSelect.mockResolvedValue([mockPayments[2]])

      await usePaymentStore.getState().fetchPaymentsByMonth(2024, 2)

      expect(mockSelect).toHaveBeenCalledWith(expect.any(String), ['2024-02-01', '2024-03-01'])
    })

    it('returns empty array on error', async () => {
      mockSelect.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().fetchPaymentsByMonth(2024, 1)

      expect(result).toEqual([])
    })
  })

  describe('fetchPaymentsBySubscription', () => {
    it('fetches payments for a specific subscription', async () => {
      const sub1Payments = mockPayments.filter((p) => p.subscription_id === 'sub-1')
      mockSelect.mockResolvedValue(sub1Payments)

      const result = await usePaymentStore.getState().fetchPaymentsBySubscription('sub-1')

      expect(mockSelect).toHaveBeenCalledWith(
        'SELECT * FROM payments WHERE subscription_id = ? ORDER BY paid_at DESC',
        ['sub-1']
      )
      expect(result).toHaveLength(2)
      expect(result.every((p) => p.subscription_id === 'sub-1')).toBe(true)
    })

    it('returns empty array on error', async () => {
      mockSelect.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().fetchPaymentsBySubscription('sub-1')

      expect(result).toEqual([])
    })
  })

  describe('fetchPaymentsWithDetails', () => {
    it('fetches payments with subscription and category details', async () => {
      mockSelect.mockResolvedValue(mockPaymentsWithDetails)

      const result = await usePaymentStore.getState().fetchPaymentsWithDetails(2024, 1)

      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining('JOIN subscriptions'),
        expect.any(Array)
      )
      expect(result[0]).toHaveProperty('subscription_name')
      expect(result[0]).toHaveProperty('category_name')
    })

    it('handles December correctly (year boundary)', async () => {
      mockSelect.mockResolvedValue([])

      await usePaymentStore.getState().fetchPaymentsWithDetails(2024, 12)

      expect(mockSelect).toHaveBeenCalledWith(expect.any(String), ['2024-12-01', '2025-01-01'])
    })

    it('returns empty array on error', async () => {
      mockSelect.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().fetchPaymentsWithDetails(2024, 1)

      expect(result).toEqual([])
    })
  })

  describe('addPayment', () => {
    it('adds a new payment and updates state', async () => {
      const newPayment = {
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: '2024-03-15T10:00:00.000Z',
        due_date: '2024-03-15',
        status: 'paid' as const,
        notes: 'March payment',
      }

      const result = await usePaymentStore.getState().addPayment(newPayment)

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments'),
        expect.arrayContaining([
          expect.stringMatching(/^pay-/),
          'sub-1',
          15.99,
          '2024-03-15T10:00:00.000Z',
          '2024-03-15',
          'paid',
          'March payment',
        ])
      )
      expect(result.id).toMatch(/^pay-/)
      expect(result.subscription_id).toBe('sub-1')

      const state = usePaymentStore.getState()
      expect(state.payments[0].subscription_id).toBe('sub-1')
    })

    it('handles null notes', async () => {
      const newPayment = {
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: '2024-03-15T10:00:00.000Z',
        due_date: '2024-03-15',
        status: 'paid' as const,
      }

      const result = await usePaymentStore.getState().addPayment(newPayment)

      expect(result.notes).toBeNull()
    })
  })

  describe('updatePayment', () => {
    beforeEach(() => {
      usePaymentStore.setState({
        payments: [...mockPayments],
        isLoading: false,
        error: null,
      })
    })

    it('updates payment amount', async () => {
      await usePaymentStore.getState().updatePayment('pay-1', { amount: 19.99 })

      expect(mockExecute).toHaveBeenCalledWith('UPDATE payments SET amount = ? WHERE id = ?', [
        19.99,
        'pay-1',
      ])

      const state = usePaymentStore.getState()
      expect(state.payments.find((p) => p.id === 'pay-1')?.amount).toBe(19.99)
    })

    it('updates payment status', async () => {
      await usePaymentStore.getState().updatePayment('pay-1', { status: 'skipped' })

      expect(mockExecute).toHaveBeenCalledWith('UPDATE payments SET status = ? WHERE id = ?', [
        'skipped',
        'pay-1',
      ])

      const state = usePaymentStore.getState()
      expect(state.payments.find((p) => p.id === 'pay-1')?.status).toBe('skipped')
    })

    it('updates multiple fields at once', async () => {
      await usePaymentStore.getState().updatePayment('pay-1', {
        amount: 19.99,
        notes: 'Updated note',
      })

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE payments SET amount = ?, notes = ? WHERE id = ?',
        [19.99, 'Updated note', 'pay-1']
      )
    })

    it('does nothing when no fields provided', async () => {
      await usePaymentStore.getState().updatePayment('pay-1', {})

      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe('deletePayment', () => {
    beforeEach(() => {
      usePaymentStore.setState({
        payments: [...mockPayments],
        isLoading: false,
        error: null,
      })
    })

    it('deletes a payment and updates state', async () => {
      await usePaymentStore.getState().deletePayment('pay-1')

      expect(mockExecute).toHaveBeenCalledWith('DELETE FROM payments WHERE id = ?', ['pay-1'])

      const state = usePaymentStore.getState()
      expect(state.payments).toHaveLength(2)
      expect(state.payments.find((p) => p.id === 'pay-1')).toBeUndefined()
    })
  })

  describe('markAsPaid', () => {
    it('creates a payment with paid status', async () => {
      const result = await usePaymentStore.getState().markAsPaid('sub-1', '2024-03-15', 15.99)

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments'),
        expect.arrayContaining(['sub-1', 15.99, expect.any(String), '2024-03-15', 'paid'])
      )
      expect(result.status).toBe('paid')
      expect(result.subscription_id).toBe('sub-1')
      expect(result.amount).toBe(15.99)
    })
  })

  describe('skipPayment', () => {
    it('creates a payment with skipped status', async () => {
      const result = await usePaymentStore.getState().skipPayment('sub-1', '2024-03-15', 15.99)

      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payments'),
        expect.arrayContaining(['sub-1', 15.99, expect.any(String), '2024-03-15', 'skipped'])
      )
      expect(result.status).toBe('skipped')
    })
  })

  describe('isPaymentRecorded', () => {
    it('returns true when payment exists', async () => {
      mockSelect.mockResolvedValue([{ count: 1 }])

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-01-15')

      expect(mockSelect).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count FROM payments'),
        ['sub-1', '2024-01-15']
      )
      expect(result).toBe(true)
    })

    it('returns false when payment does not exist', async () => {
      mockSelect.mockResolvedValue([{ count: 0 }])

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-03-15')

      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockSelect.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-01-15')

      expect(result).toBe(false)
    })
  })
})
