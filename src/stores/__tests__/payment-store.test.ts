import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePaymentStore } from '../payment-store'

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

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('usePaymentStore', () => {
  beforeEach(() => {
    usePaymentStore.setState({
      payments: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('fetchPayments', () => {
    it('fetches payments and updates state', async () => {
      mockInvoke.mockResolvedValue(mockPayments)

      await usePaymentStore.getState().fetchPayments()

      expect(mockInvoke).toHaveBeenCalledWith('list_payments')
      const state = usePaymentStore.getState()
      expect(state.payments).toHaveLength(3)
      expect(state.payments[0].id).toBe('pay-1')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets loading state during fetch', async () => {
      mockInvoke.mockResolvedValue(mockPayments)
      const fetchPromise = usePaymentStore.getState().fetchPayments()
      expect(usePaymentStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(usePaymentStore.getState().isLoading).toBe(false)
    })

    it('handles fetch errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await usePaymentStore.getState().fetchPayments()

      const state = usePaymentStore.getState()
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
      expect(state.payments).toEqual([])
    })
  })

  describe('fetchPaymentsByMonth', () => {
    it('fetches payments for a specific month', async () => {
      mockInvoke.mockResolvedValue([mockPayments[0], mockPayments[1]])

      const result = await usePaymentStore.getState().fetchPaymentsByMonth(2024, 1)

      expect(mockInvoke).toHaveBeenCalledWith('list_payments_by_month', { year: 2024, month: 1 })
      expect(result).toHaveLength(2)
    })

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().fetchPaymentsByMonth(2024, 1)
      expect(result).toEqual([])
    })
  })

  describe('fetchPaymentsWithDetails', () => {
    it('fetches payments with subscription and category details', async () => {
      mockInvoke.mockResolvedValue(mockPaymentsWithDetails)

      const result = await usePaymentStore.getState().fetchPaymentsWithDetails(2024, 1)

      expect(mockInvoke).toHaveBeenCalledWith('list_payments_with_details', {
        year: 2024,
        month: 1,
      })
      expect(result[0]).toHaveProperty('subscription_name')
      expect(result[0]).toHaveProperty('category_name')
    })

    it('returns empty array on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().fetchPaymentsWithDetails(2024, 1)
      expect(result).toEqual([])
    })
  })

  describe('addPayment', () => {
    it('adds a new payment and updates state', async () => {
      const created = {
        id: 'pay-new',
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: '2024-03-15T10:00:00.000Z',
        due_date: '2024-03-15',
        status: 'paid',
        notes: 'March payment',
        created_at: '2024-03-15T10:00:00.000Z',
      }
      mockInvoke.mockResolvedValue(created)

      const newPayment = {
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: '2024-03-15T10:00:00.000Z',
        due_date: '2024-03-15',
        status: 'paid' as const,
        notes: 'March payment',
      }

      const result = await usePaymentStore.getState().addPayment(newPayment)

      expect(mockInvoke).toHaveBeenCalledWith('create_payment', {
        data: expect.objectContaining({
          subscription_id: 'sub-1',
          amount: 15.99,
        }),
      })
      expect(result.subscription_id).toBe('sub-1')

      const state = usePaymentStore.getState()
      expect(state.payments[0].subscription_id).toBe('sub-1')
    })
  })

  describe('markAsPaid', () => {
    it('creates a payment with paid status', async () => {
      const created = {
        id: 'pay-new',
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: expect.any(String),
        due_date: '2024-03-15',
        status: 'paid',
        notes: null,
        created_at: expect.any(String),
      }
      mockInvoke.mockResolvedValue(created)

      const result = await usePaymentStore.getState().markAsPaid('sub-1', '2024-03-15', 15.99)

      expect(mockInvoke).toHaveBeenCalledWith('mark_payment_paid', {
        subscriptionId: 'sub-1',
        dueDate: '2024-03-15',
        amount: 15.99,
      })
      expect(result.status).toBe('paid')
      expect(result.subscription_id).toBe('sub-1')
    })
  })

  describe('skipPayment', () => {
    it('creates a payment with skipped status', async () => {
      const created = {
        id: 'pay-new',
        subscription_id: 'sub-1',
        amount: 15.99,
        paid_at: expect.any(String),
        due_date: '2024-03-15',
        status: 'skipped',
        notes: null,
        created_at: expect.any(String),
      }
      mockInvoke.mockResolvedValue(created)

      const result = await usePaymentStore.getState().skipPayment('sub-1', '2024-03-15', 15.99)

      expect(mockInvoke).toHaveBeenCalledWith('skip_payment', {
        subscriptionId: 'sub-1',
        dueDate: '2024-03-15',
        amount: 15.99,
      })
      expect(result.status).toBe('skipped')
    })
  })

  describe('isPaymentRecorded', () => {
    it('returns true when payment exists', async () => {
      mockInvoke.mockResolvedValue(true)

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-01-15')

      expect(mockInvoke).toHaveBeenCalledWith('is_payment_recorded', {
        subscriptionId: 'sub-1',
        dueDate: '2024-01-15',
      })
      expect(result).toBe(true)
    })

    it('returns false when payment does not exist', async () => {
      mockInvoke.mockResolvedValue(false)

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-03-15')
      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockInvoke.mockRejectedValue(new Error('Query failed'))

      const result = await usePaymentStore.getState().isPaymentRecorded('sub-1', '2024-01-15')
      expect(result).toBe(false)
    })
  })
})
