import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type {
  CalendarOccurrence,
  Payment,
  PaymentFormData,
  PaymentWithSubscription,
} from '@/types/payment'

type CalendarMonth = {
  occurrences: CalendarOccurrence[]
  isLoading: boolean
  error: string | null
}

interface PaymentState {
  payments: Payment[]
  calendarMonths: Record<string, CalendarMonth>
  isLoading: boolean
  error: string | null
  fetchPayments: () => Promise<void>
  fetchPaymentsByMonth: (year: number, month: number) => Promise<Payment[]>
  fetchPaymentsBySubscription: (subscriptionId: string) => Promise<Payment[]>
  fetchPaymentsWithDetails: (year: number, month: number) => Promise<PaymentWithSubscription[]>
  fetchCalendarMonth: (year: number, month: number) => Promise<CalendarOccurrence[]>
  watchCalendarMonth: (year: number, month: number) => () => void
  invalidateCalendar: () => void
  addPayment: (data: PaymentFormData) => Promise<Payment>
  updatePayment: (id: string, data: Partial<PaymentFormData>) => Promise<void>
  deletePayment: (id: string) => Promise<void>
  markAsPaid: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  skipPayment: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  isPaymentRecorded: (subscriptionId: string, dueDate: string) => Promise<boolean>
}

export const usePaymentStore = create<PaymentState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let pending = 0
  let calendarRequest = 0
  const calendarRequests = new Map<string, number>()
  const calendarWatchers = new Map<string, number>()
  type Mutation = {
    data: Partial<PaymentFormData> | null
    settled: boolean
    failed: boolean
    result?: Payment
  }
  const mutations = new Map<
    string,
    { base: Payment | undefined; index: number; entries: Mutation[] }
  >()
  const refetchInvalidatedCalendarMonths = () => {
    if (pending !== 0) return
    for (const key of calendarWatchers.keys()) {
      if (!get().calendarMonths[key]?.isLoading) continue
      const [year, monthNumber] = key.split('-').map(Number)
      void get()
        .fetchCalendarMonth(year, monthNumber)
        .catch(() => {
          // The calendar query exposes its error on the month, including background refreshes.
        })
    }
  }
  const invalidateCalendar = () => {
    calendarRequests.clear()
    set((state) => ({
      calendarMonths: Object.fromEntries(
        Object.entries(state.calendarMonths)
          .filter(([key]) => calendarWatchers.has(key))
          .map(([key, month]) => [key, { ...month, isLoading: true, error: null }])
      ),
    }))
    refetchInvalidatedCalendarMonths()
  }
  const beginMutation = () => {
    generation++
    pending++
    invalidateCalendar()
  }
  const mutate = async (
    id: string,
    data: Partial<PaymentFormData> | null,
    request: () => Promise<Payment | void>
  ) => {
    const journal = mutations.get(id) ?? {
      base: get().payments.find((p) => p.id === id),
      index: get().payments.findIndex((p) => p.id === id),
      entries: [],
    }
    const mutation: Mutation = { data, settled: false, failed: false }
    journal.entries.push(mutation)
    mutations.set(id, journal)
    beginMutation()
    const publish = () => {
      let payment = journal.base
      for (const entry of journal.entries) {
        if (entry.failed) continue
        payment = entry.settled
          ? entry.result
          : entry.data === null
            ? undefined
            : payment
              ? { ...payment, ...entry.data }
              : undefined
      }
      set((state) => {
        const payments = state.payments.filter((p) => p.id !== id)
        if (payment) payments.splice(journal.index, 0, payment)
        return { payments }
      })
    }
    publish()
    try {
      mutation.result = (await request()) || undefined
    } catch (error) {
      mutation.failed = true
      set({ error: String(error) })
      throw error
    } finally {
      mutation.settled = true
      publish()
      pending--
      generation++
      refetchInvalidatedCalendarMonths()
      if (journal.entries.every((entry) => entry.settled)) mutations.delete(id)
    }
  }
  type OccurrenceWrite = { settled: boolean; result?: Payment }
  const occurrenceWrites = new Map<string, OccurrenceWrite[]>()
  const createPayment = async (key: string, request: () => Promise<Payment>) => {
    const entries = occurrenceWrites.get(key) ?? []
    const entry: OccurrenceWrite = { settled: false }
    entries.push(entry)
    occurrenceWrites.set(key, entries)
    beginMutation()
    try {
      const payment = await request()
      entry.result = payment
      let latest = payment
      for (const write of entries) if (write.result) latest = write.result
      set((state) => ({ payments: [latest, ...state.payments.filter((p) => p.id !== latest.id)] }))
      return payment
    } catch (error) {
      set({ error: String(error) })
      throw error
    } finally {
      entry.settled = true
      pending--
      generation++
      refetchInvalidatedCalendarMonths()
      if (entries.every((write) => write.settled)) occurrenceWrites.delete(key)
    }
  }
  return {
    payments: [],
    calendarMonths: {},
    isLoading: false,
    error: null,
    invalidateCalendar,
    watchCalendarMonth: (year, month) => {
      const key = `${year}-${String(month).padStart(2, '0')}`
      calendarWatchers.set(key, (calendarWatchers.get(key) ?? 0) + 1)
      return () => {
        const count = calendarWatchers.get(key) ?? 0
        if (count <= 1) calendarWatchers.delete(key)
        else calendarWatchers.set(key, count - 1)
      }
    },
    fetchPayments: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = pending === 0
      calendarRequests.clear()
      set({ isLoading: true, error: null, calendarMonths: {} })
      try {
        const payments = await invoke('list_payments')
        if (request === fetchRequest && started === generation && canPublish) set({ payments })
      } catch (error) {
        if (request === fetchRequest) set({ error: String(error) })
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },
    fetchPaymentsByMonth: async (year, month) => {
      set({ error: null })
      try {
        return await invoke('list_payments_by_month', { year, month })
      } catch (error) {
        set({ error: String(error) })
        throw error
      }
    },
    fetchPaymentsBySubscription: async (subscriptionId) => {
      try {
        const all = await invoke('list_payments')
        return all.filter((p) => p.subscription_id === subscriptionId)
      } catch (error) {
        set({ error: String(error) })
        return []
      }
    },
    fetchPaymentsWithDetails: async (year, month) => {
      set({ error: null })
      try {
        return await invoke('list_payments_with_details', { year, month })
      } catch (error) {
        set({ error: String(error) })
        throw error
      }
    },
    fetchCalendarMonth: async (year, month) => {
      const key = `${year}-${String(month).padStart(2, '0')}`
      const request = ++calendarRequest
      const started = generation
      const canPublish = pending === 0
      calendarRequests.set(key, request)
      set((state) => ({
        calendarMonths: {
          ...state.calendarMonths,
          [key]: {
            occurrences: state.calendarMonths[key]?.occurrences ?? [],
            isLoading: true,
            error: null,
          },
        },
      }))
      try {
        const occurrences = await invoke('list_calendar_payments', { year, month })
        if (!Array.isArray(occurrences)) {
          throw new Error('Calendar data unavailable: unexpected response from the backend')
        }
        if (calendarRequests.get(key) === request && started === generation && canPublish) {
          set((state) => ({
            calendarMonths: {
              ...state.calendarMonths,
              [key]: { occurrences, isLoading: false, error: null },
            },
          }))
        }
        return occurrences
      } catch (error) {
        if (calendarRequests.get(key) === request && started === generation && canPublish) {
          set((state) => ({
            error: String(error),
            calendarMonths: {
              ...state.calendarMonths,
              [key]: {
                occurrences: state.calendarMonths[key]?.occurrences ?? [],
                isLoading: false,
                error: String(error),
              },
            },
          }))
        }
        throw error
      } finally {
        // Discarded reads stay loading until the last write starts a fresh query.
        if (calendarRequests.get(key) === request) calendarRequests.delete(key)
      }
    },
    addPayment: (data) =>
      createPayment(`${data.subscription_id}:${data.due_date}`, () =>
        invoke('create_payment', { data: { ...data, notes: data.notes || null } })
      ),
    updatePayment: async (id, data) => {
      if (!get().payments.some((p) => p.id === id)) return
      await mutate(id, data, () => invoke('update_payment', { id, data }))
    },
    deletePayment: (id) => mutate(id, null, () => invoke('delete_payment', { id })),
    markAsPaid: (subscriptionId, dueDate, amount) =>
      createPayment(`${subscriptionId}:${dueDate}`, () =>
        invoke('mark_payment_paid', { subscriptionId, dueDate, amount })
      ),
    skipPayment: (subscriptionId, dueDate, amount) =>
      createPayment(`${subscriptionId}:${dueDate}`, () =>
        invoke('skip_payment', { subscriptionId, dueDate, amount })
      ),
    isPaymentRecorded: async (subscriptionId, dueDate) => {
      try {
        return await invoke('is_payment_recorded', { subscriptionId, dueDate })
      } catch (error) {
        set({ error: String(error) })
        return false
      }
    },
  }
})
