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

export const usePaymentStore = create<PaymentState>((set) => ({
  payments: [],
  isLoading: false,
  error: null,

  fetchPayments: async () => {
    set({ isLoading: true, error: null })
    try {
      const result = await invoke<Payment[]>('list_payments')
      set({ payments: result, isLoading: false })
    } catch (error) {
      set({ error: (error as Error).message || String(error), isLoading: false })
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
  },

  updatePayment: async (_id: string, _data: Partial<PaymentFormData>) => {
    // Payment updates are not commonly used in the UI.
    // If needed, re-fetch the full payment list from backend.
    const result = await invoke<Payment[]>('list_payments')
    set({ payments: result })
  },

  deletePayment: async (id: string) => {
    set((state) => ({
      payments: state.payments.filter((p) => p.id !== id),
    }))
  },

  markAsPaid: async (subscriptionId: string, dueDate: string, amount: number) => {
    const payment = await invoke<Payment>('mark_payment_paid', {
      subscriptionId,
      dueDate,
      amount,
    })
    set((state) => ({ payments: [payment, ...state.payments] }))
    return payment
  },

  skipPayment: async (subscriptionId: string, dueDate: string, amount: number) => {
    const payment = await invoke<Payment>('skip_payment', {
      subscriptionId,
      dueDate,
      amount,
    })
    set((state) => ({ payments: [payment, ...state.payments] }))
    return payment
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
