import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { format, addMonths, subMonths, getDay, startOfMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CalendarDay } from '@/components/calendar/calendar-day'
import { CalendarDayPanel } from '@/components/calendar/calendar-day-panel'
import { MonthSummaryHeader } from '@/components/calendar/month-summary-header'
import { useCalendarStats } from '@/hooks/use-calendar-stats'
import { usePaymentStore } from '@/stores/payment-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [direction, setDirection] = useState(0)

  const { settings, fetch: fetchSettings } = useSettingsStore()
  const currency = (settings?.currency || 'USD') as CurrencyCode

  const { calendarDays, monthStats, getPaymentsForDate, refetchPayments } =
    useCalendarStats(currentDate)
  const { markAsPaid, skipPayment } = usePaymentStore()
  const { openSubscriptionDialog } = useUiStore()

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const selectedPayments = selectedDate ? getPaymentsForDate(selectedDate) : []
  const firstDayOffset = getDay(startOfMonth(currentDate))

  const navigateMonth = useCallback((delta: number) => {
    setDirection(delta)
    setCurrentDate((prev) => (delta > 0 ? addMonths(prev, 1) : subMonths(prev, 1)))
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    setDirection(today > currentDate ? 1 : -1)
    setCurrentDate(today)
    setSelectedDate(today)
  }, [currentDate])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return
      }

      switch (e.key) {
        case 'ArrowLeft':
          if (e.metaKey || e.ctrlKey) {
            navigateMonth(-1)
          }
          break
        case 'ArrowRight':
          if (e.metaKey || e.ctrlKey) {
            navigateMonth(1)
          }
          break
        case 'PageUp':
          navigateMonth(-1)
          break
        case 'PageDown':
          navigateMonth(1)
          break
        case 't':
        case 'T':
          goToToday()
          break
        case 'Escape':
          setSelectedDate(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateMonth, goToToday])

  const handleMarkPaid = async (subscriptionId: string, dueDate: string, amount: number) => {
    await markAsPaid(subscriptionId, dueDate, amount)
    refetchPayments()
  }

  const handleSkip = async (subscriptionId: string, dueDate: string, amount: number) => {
    await skipPayment(subscriptionId, dueDate, amount)
    refetchPayments()
  }

  const handleEdit = (subscription: Subscription) => {
    openSubscriptionDialog(subscription.id)
  }

  const variants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 space-y-6 overflow-auto p-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Calendar</h1>
            <p className="text-muted-foreground">View and manage your payment schedule</p>
          </div>
          <Button variant="outline" onClick={goToToday} className="gap-2">
            <CalendarIcon className="h-4 w-4" />
            Today
          </Button>
        </div>

        <MonthSummaryHeader
          totalAmount={monthStats.totalAmount}
          paidAmount={monthStats.paidAmount}
          upcomingAmount={monthStats.upcomingAmount}
          paymentCount={monthStats.paymentCount}
          paidCount={monthStats.paidCount}
          comparisonToPrevMonth={monthStats.comparisonToPrevMonth}
          currency={currency}
        />

        <div className="glass-card p-6">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(-1)}>
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <h2 className="min-w-[180px] text-center text-xl font-semibold">
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <Button variant="ghost" size="icon" onClick={() => navigateMonth(1)}>
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              Press T for today, PageUp/PageDown for months
            </p>
          </div>

          <div className="mb-2 grid grid-cols-7 gap-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="text-muted-foreground p-2 text-center text-sm font-medium">
                {day}
              </div>
            ))}
          </div>

          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={format(currentDate, 'yyyy-MM')}
              custom={direction}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="grid grid-cols-7 gap-2"
            >
              {Array.from({ length: firstDayOffset }).map((_, i) => (
                <div key={`empty-${i}`} className="h-12" />
              ))}

              {calendarDays.map((day) => (
                <CalendarDay
                  key={day.date.toISOString()}
                  dayOfMonth={day.dayOfMonth}
                  isCurrentMonth={day.isCurrentMonth}
                  isToday={day.isToday}
                  isSelected={
                    selectedDate
                      ? format(selectedDate, 'yyyy-MM-dd') === format(day.date, 'yyyy-MM-dd')
                      : false
                  }
                  payments={day.payments}
                  totalAmount={day.totalAmount}
                  onClick={() => setSelectedDate(day.date)}
                />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <CalendarDayPanel
        isOpen={selectedDate !== null}
        selectedDate={selectedDate}
        payments={selectedPayments}
        currency={currency}
        onClose={() => setSelectedDate(null)}
        onMarkPaid={handleMarkPaid}
        onSkip={handleSkip}
        onEdit={handleEdit}
      />
    </div>
  )
}
