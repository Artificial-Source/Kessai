import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
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
      const result = await invoke<Payment[]>('list_payments')
      set({ payments: result, isLoading: false })
    } catch (error) {
      set({ error: String(error), isLoading: false })
    }
  },

  fetchPaymentsByMonth: async (year: number, month: number) => {
    try {
      return await invoke<Payment[]>('list_payments_by_month', { year, month })
    } catch (error) {
      console.error('Error fetching payments by month:', error)
      return []
    }
  },

  fetchPaymentsBySubscription: async (subscriptionId: string) => {
    try {
      // Use list_payments and filter client-side (no dedicated command for this)
      const all = await invoke<Payment[]>('list_payments')
      return all.filter((p) => p.subscription_id === subscriptionId)
    } catch (error) {
      console.error('Error fetching payments by subscription:', error)
      return []
    }
  },

  fetchPaymentsWithDetails: async (year: number, month: number) => {
    try {
      return await invoke<PaymentWithSubscription[]>('list_payments_with_details', { year, month })
    } catch (error) {
      console.error('Error fetching payments with details:', error)
      return []
    }
  },

  addPayment: async (data: PaymentFormData) => {
    try {
      const payment = await invoke<Payment>('create_payment', {
        data: {
          subscription_id: data.subscription_id,
          amount: data.amount,
          paid_at: data.paid_at,
          due_date: data.due_date,
          status: data.status,
          notes: data.notes || null,
        },
      })
      set((state) => ({ payments: [payment, ...state.payments] }))
      return payment
    } catch (error) {
      console.error('Failed to add payment:', error)
      throw error
    }
  },

  updatePayment: async (id: string, data: Partial<PaymentFormData>) => {
    const previousPayments = get().payments
    const payment = previousPayments.find((p) => p.id === id)
    if (!payment) return

    // Optimistic update
    set((state) => ({
      payments: state.payments.map((p) => (p.id === id ? { ...p, ...data } : p)),
    }))

    try {
      const updated = await invoke<Payment>('update_payment', { id, data })
      set((state) => ({
        payments: state.payments.map((p) => (p.id === id ? updated : p)),
      }))
    } catch (error) {
      set({ payments: previousPayments })
      console.error('Failed to update payment:', error)
      throw error
    }
  },

  deletePayment: async (id: string) => {
    const previousPayments = get().payments

    // Optimistic delete
    set((state) => ({
      payments: state.payments.filter((p) => p.id !== id),
    }))

    try {
      await invoke('delete_payment', { id })
    } catch (error) {
      set({ payments: previousPayments })
      console.error('Failed to delete payment:', error)
      throw error
    }
  },

  markAsPaid: async (subscriptionId: string, dueDate: string, amount: number) => {
    try {
      const payment = await invoke<Payment>('mark_payment_paid', {
        subscriptionId,
        dueDate,
        amount,
      })
      set((state) => ({ payments: [payment, ...state.payments] }))
      return payment
    } catch (error) {
      console.error('Failed to mark payment as paid:', error)
      throw error
    }
  },

  skipPayment: async (subscriptionId: string, dueDate: string, amount: number) => {
    try {
      const payment = await invoke<Payment>('skip_payment', {
        subscriptionId,
        dueDate,
        amount,
      })
      set((state) => ({ payments: [payment, ...state.payments] }))
      return payment
    } catch (error) {
      console.error('Failed to skip payment:', error)
      throw error
    }
  },

  isPaymentRecorded: async (subscriptionId: string, dueDate: string) => {
    try {
      return await invoke<boolean>('is_payment_recorded', { subscriptionId, dueDate })
    } catch (error) {
      console.error('Error checking payment status:', error)
      return false
    }
  },
}))
