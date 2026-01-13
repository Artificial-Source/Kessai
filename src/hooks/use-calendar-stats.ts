import { useMemo, useEffect, useState } from 'react'
import { useSubscriptions } from './use-subscriptions'
import { usePaymentStore } from '@/stores/payment-store'
import {
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  format,
  parseISO,
  isSameMonth,
  getDate,
} from 'date-fns'
import type { Subscription } from '@/types/subscription'
import type { Payment } from '@/types/payment'

interface DayPayment {
  subscription: Subscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  dueDate: string
}

interface CalendarDay {
  date: Date
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  payments: DayPayment[]
  totalAmount: number
}

interface MonthStats {
  totalAmount: number
  paidAmount: number
  upcomingAmount: number
  paymentCount: number
  paidCount: number
  comparisonToPrevMonth: number
}

export function useCalendarStats(currentDate: Date) {
  const { subscriptions } = useSubscriptions()
  const fetchPaymentsByMonth = usePaymentStore((s) => s.fetchPaymentsByMonth)
  const [payments, setPayments] = useState<Payment[]>([])
  const [prevMonthPayments, setPrevMonthPayments] = useState<Payment[]>([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth() + 1

  useEffect(() => {
    fetchPaymentsByMonth(year, month).then(setPayments)
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    fetchPaymentsByMonth(prevYear, prevMonth).then(setPrevMonthPayments)
  }, [year, month, fetchPaymentsByMonth])

  const subscriptionsForMonth = useMemo(() => {
    const activeSubscriptions = subscriptions.filter((s) => s.is_active)

    return activeSubscriptions.filter((sub) => {
      if (sub.billing_cycle === 'yearly' && sub.next_payment_date) {
        const nextPayment = parseISO(sub.next_payment_date)
        return isSameMonth(nextPayment, currentDate)
      }
      return true
    })
  }, [subscriptions, currentDate])

  const getPaymentsForDay = useMemo(() => {
    return (dayOfMonth: number): DayPayment[] => {
      const dateStr = format(new Date(year, month - 1, dayOfMonth), 'yyyy-MM-dd')

      return subscriptionsForMonth
        .filter((sub) => {
          if (sub.next_payment_date) {
            const nextPayment = parseISO(sub.next_payment_date)
            if (isSameMonth(nextPayment, currentDate)) {
              return getDate(nextPayment) === dayOfMonth
            }
          }

          if (
            sub.billing_day &&
            (sub.billing_cycle === 'monthly' || sub.billing_cycle === 'quarterly')
          ) {
            return sub.billing_day === dayOfMonth
          }

          if (sub.billing_cycle === 'weekly' && sub.next_payment_date) {
            const nextPayment = parseISO(sub.next_payment_date)
            const checkDate = new Date(year, month - 1, dayOfMonth)
            return nextPayment.getDay() === checkDate.getDay()
          }

          return false
        })
        .map((sub) => {
          const payment = payments.find(
            (p) => p.subscription_id === sub.id && p.due_date === dateStr
          )

          return {
            subscription: sub,
            amount: sub.amount,
            isPaid: payment?.status === 'paid',
            isSkipped: payment?.status === 'skipped',
            dueDate: dateStr,
          }
        })
    }
  }, [subscriptionsForMonth, payments, year, month, currentDate])

  const calendarDays = useMemo((): CalendarDay[] => {
    const monthStart = startOfMonth(currentDate)
    const monthEnd = endOfMonth(currentDate)
    const today = new Date()

    return eachDayOfInterval({ start: monthStart, end: monthEnd }).map((date) => {
      const dayOfMonth = getDate(date)
      const dayPayments = getPaymentsForDay(dayOfMonth)

      return {
        date,
        dayOfMonth,
        isCurrentMonth: true,
        isToday: format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd'),
        payments: dayPayments,
        totalAmount: dayPayments.reduce((sum, p) => sum + p.amount, 0),
      }
    })
  }, [currentDate, getPaymentsForDay])

  const monthStats = useMemo((): MonthStats => {
    const allPaymentsThisMonth = calendarDays.flatMap((day) => day.payments)

    const totalAmount = allPaymentsThisMonth.reduce((sum, p) => sum + p.amount, 0)
    const paidAmount = allPaymentsThisMonth
      .filter((p) => p.isPaid)
      .reduce((sum, p) => sum + p.amount, 0)
    const upcomingAmount = allPaymentsThisMonth
      .filter((p) => !p.isPaid && !p.isSkipped)
      .reduce((sum, p) => sum + p.amount, 0)

    const prevMonthTotal = prevMonthPayments.reduce((sum, p) => sum + p.amount, 0)
    const comparisonToPrevMonth =
      prevMonthTotal > 0 ? ((totalAmount - prevMonthTotal) / prevMonthTotal) * 100 : 0

    return {
      totalAmount,
      paidAmount,
      upcomingAmount,
      paymentCount: allPaymentsThisMonth.length,
      paidCount: allPaymentsThisMonth.filter((p) => p.isPaid).length,
      comparisonToPrevMonth,
    }
  }, [calendarDays, prevMonthPayments])

  const getPaymentsForDate = (date: Date): DayPayment[] => {
    const day = calendarDays.find(
      (d) => format(d.date, 'yyyy-MM-dd') === format(date, 'yyyy-MM-dd')
    )
    return day?.payments || []
  }

  return {
    calendarDays,
    monthStats,
    getPaymentsForDate,
    getPaymentsForDay,
    refetchPayments: () => fetchPaymentsByMonth(year, month).then(setPayments),
  }
}
