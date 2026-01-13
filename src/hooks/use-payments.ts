import { useEffect } from 'react'
import { usePaymentStore } from '@/stores/payment-store'

export function usePayments() {
  const store = usePaymentStore()

  useEffect(() => {
    store.fetchPayments()
  }, [store])

  return {
    payments: store.payments,
    isLoading: store.isLoading,
    error: store.error,
    addPayment: store.addPayment,
    updatePayment: store.updatePayment,
    deletePayment: store.deletePayment,
    markAsPaid: store.markAsPaid,
    skipPayment: store.skipPayment,
    isPaymentRecorded: store.isPaymentRecorded,
    fetchPaymentsByMonth: store.fetchPaymentsByMonth,
    fetchPaymentsBySubscription: store.fetchPaymentsBySubscription,
    fetchPaymentsWithDetails: store.fetchPaymentsWithDetails,
    refetch: store.fetchPayments,
  }
}
