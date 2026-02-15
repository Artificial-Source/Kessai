import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
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
  const firstDayOffset = dayjs(currentDate).startOf('month').day()

  const navigateMonth = useCallback((delta: number) => {
    setCurrentDate((prev) =>
      delta > 0 ? dayjs(prev).add(1, 'month').toDate() : dayjs(prev).subtract(1, 'month').toDate()
    )
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }, [])

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

  return (
    <div className="flex h-full flex-col gap-6 lg:flex-row">
      <div className="flex flex-1 flex-col gap-6 overflow-auto">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-foreground mb-1 text-3xl font-semibold tracking-tight md:text-4xl">
              Calendar
            </h1>
            <p className="text-muted-foreground text-base font-normal">
              Track your payment schedule
            </p>
          </div>

          <div className="glass-card flex items-center gap-2 self-start rounded-xl p-1.5 px-3 md:gap-4 lg:self-auto">
            <button
              onClick={goToToday}
              className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors"
            >
              Today
            </button>
            <div className="bg-border hidden h-4 w-px md:block" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth(-1)}
                aria-label="Previous month"
                className="text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-foreground min-w-[140px] text-center text-lg font-semibold tracking-tight">
                {dayjs(currentDate).format('MMMM YYYY')}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                aria-label="Next month"
                className="text-foreground hover:bg-accent rounded-lg p-1.5 transition-colors"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <MonthSummaryHeader
          totalAmount={monthStats.totalAmount}
          paidAmount={monthStats.paidAmount}
          upcomingAmount={monthStats.upcomingAmount}
          paymentCount={monthStats.paymentCount}
          paidCount={monthStats.paidCount}
          comparisonToPrevMonth={monthStats.comparisonToPrevMonth}
          currency={currency}
        />

        <div className="glass-card flex flex-1 flex-col overflow-hidden rounded-xl p-1">
          <div className="border-border bg-muted/50 grid grid-cols-7 border-b">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="text-muted-foreground py-4 text-center text-xs font-bold tracking-widest uppercase"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid flex-1 grid-cols-7 grid-rows-5 overflow-y-auto">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="border-border bg-muted/30 text-muted-foreground/30 flex min-h-[100px] flex-col gap-1 border p-2"
              />
            ))}

            {calendarDays.map((day) => (
              <CalendarDay
                key={day.date.toISOString()}
                dayOfMonth={day.dayOfMonth}
                isCurrentMonth={day.isCurrentMonth}
                isToday={day.isToday}
                isSelected={
                  selectedDate ? dayjs(selectedDate).isSame(dayjs(day.date), 'day') : false
                }
                payments={day.payments}
                totalAmount={day.totalAmount}
                currency={currency}
                onClick={() => setSelectedDate(day.date)}
              />
            ))}
          </div>
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
