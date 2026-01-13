import { create } from 'zustand'
import { getDatabase } from '@/lib/database'
import type { Payment, PaymentFormData, PaymentWithSubscription } from '@/types/payment'

interface PaymentState {
  payments: Payment[]
  isLoading: boolean
  error: string | null

  fetchPayments: () => Promise<void>
  fetchPaymentsByMonth: (year: number, month: number) => Promise<Payment[]>
  fetchPaymentsBySubscription: (subscriptionId: string) => Promise<Payment[]>
  fetchPaymentsWithDetails: (year: number, month: number) => Promise<PaymentWithSubscription[]>
  addPayment: (data: PaymentFormData) => Promise<Payment>
  updatePayment: (id: string, data: Partial<PaymentFormData>) => Promise<void>
  deletePayment: (id: string) => Promise<void>
  markAsPaid: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  skipPayment: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  isPaymentRecorded: (subscriptionId: string, dueDate: string) => Promise<boolean>
}

export const usePaymentStore = create<PaymentState>((set, get) => ({
  payments: [],
  isLoading: false,
  error: null,

  fetchPayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const db = await getDatabase()
      const result = await db.select<Payment[]>('SELECT * FROM payments ORDER BY paid_at DESC')
      set({ payments: result, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false })
    }
  },

  fetchPaymentsByMonth: async (year: number, month: number) => {
    try {
      const db = await getDatabase()
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = `${year}-${String(month + 1).padStart(2, '0')}-01`

      const result = await db.select<Payment[]>(
        `SELECT * FROM payments 
         WHERE due_date >= ? AND due_date < ?
         ORDER BY due_date ASC`,
        [startDate, endDate]
      )
      return result
    } catch (error) {
      console.error('Error fetching payments by month:', error)
      return []
    }
  },

  fetchPaymentsBySubscription: async (subscriptionId: string) => {
    try {
      const db = await getDatabase()
      const result = await db.select<Payment[]>(
        'SELECT * FROM payments WHERE subscription_id = ? ORDER BY paid_at DESC',
        [subscriptionId]
      )
      return result
    } catch (error) {
      console.error('Error fetching payments by subscription:', error)
      return []
    }
  },

  fetchPaymentsWithDetails: async (year: number, month: number) => {
    try {
      const db = await getDatabase()
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`

      const result = await db.select<PaymentWithSubscription[]>(
        `SELECT 
          p.*,
          s.name as subscription_name,
          s.color as subscription_color,
          c.name as category_name,
          c.color as category_color
         FROM payments p
         JOIN subscriptions s ON p.subscription_id = s.id
         LEFT JOIN categories c ON s.category_id = c.id
         WHERE p.due_date >= ? AND p.due_date < ?
         ORDER BY p.due_date ASC`,
        [startDate, endDate]
      )
      return result
    } catch (error) {
      console.error('Error fetching payments with details:', error)
      return []
    }
  },

  addPayment: async (data: PaymentFormData) => {
    const db = await getDatabase()
    const id = `pay-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    const now = new Date().toISOString()

    await db.execute(
      `INSERT INTO payments (id, subscription_id, amount, paid_at, due_date, status, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.subscription_id,
        data.amount,
        data.paid_at,
        data.due_date,
        data.status,
        data.notes || null,
        now,
      ]
    )

    const payment: Payment = {
      id,
      ...data,
      notes: data.notes || null,
      created_at: now,
    }

    set((state) => ({ payments: [payment, ...state.payments] }))
    return payment
  },

  updatePayment: async (id: string, data: Partial<PaymentFormData>) => {
    const db = await getDatabase()
    const fields: string[] = []
    const values: unknown[] = []

    if (data.amount !== undefined) {
      fields.push('amount = ?')
      values.push(data.amount)
    }
    if (data.paid_at !== undefined) {
      fields.push('paid_at = ?')
      values.push(data.paid_at)
    }
    if (data.status !== undefined) {
      fields.push('status = ?')
      values.push(data.status)
    }
    if (data.notes !== undefined) {
      fields.push('notes = ?')
      values.push(data.notes)
    }

    if (fields.length === 0) return

    values.push(id)
    await db.execute(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, values)

    set((state) => ({
      payments: state.payments.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }))
  },

  deletePayment: async (id: string) => {
    const db = await getDatabase()
    await db.execute('DELETE FROM payments WHERE id = ?', [id])
    set((state) => ({
      payments: state.payments.filter((p) => p.id !== id),
    }))
  },

  markAsPaid: async (subscriptionId: string, dueDate: string, amount: number) => {
    const now = new Date().toISOString()
    return get().addPayment({
      subscription_id: subscriptionId,
      amount,
      paid_at: now,
      due_date: dueDate,
      status: 'paid',
    })
  },

  skipPayment: async (subscriptionId: string, dueDate: string, amount: number) => {
    const now = new Date().toISOString()
    return get().addPayment({
      subscription_id: subscriptionId,
      amount,
      paid_at: now,
      due_date: dueDate,
      status: 'skipped',
    })
  },

  isPaymentRecorded: async (subscriptionId: string, dueDate: string) => {
    try {
      const db = await getDatabase()
      const result = await db.select<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM payments 
         WHERE subscription_id = ? AND due_date = ?`,
        [subscriptionId, dueDate]
      )
      return result[0]?.count > 0
    } catch (error) {
      console.error('Error checking payment status:', error)
      return false
    }
  },
}))
