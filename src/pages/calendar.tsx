import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { CalendarDay } from '@/components/calendar/calendar-day'
import { CalendarDayPanel } from '@/components/calendar/calendar-day-panel'
import { MonthSummaryHeader } from '@/components/calendar/month-summary-header'
import { useCalendarStats } from '@/hooks/use-calendar-stats'
import { usePaymentStore } from '@/stores/payment-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'

const WEEKDAYS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAYS_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
    try {
      await markAsPaid(subscriptionId, dueDate, amount)
      refetchPayments()
    } catch {
      toast.error('Error', { description: 'Failed to record payment.' })
    }
  }

  const handleSkip = async (subscriptionId: string, dueDate: string, amount: number) => {
    try {
      await skipPayment(subscriptionId, dueDate, amount)
      refetchPayments()
    } catch {
      toast.error('Error', { description: 'Failed to skip payment.' })
    }
  }

  const handleEdit = (subscription: Subscription) => {
    openSubscriptionDialog(subscription.id)
  }

  return (
    <div className="animate-fade-in-up flex h-full flex-col space-y-6 lg:flex-row lg:gap-6 lg:space-y-0">
      <div className="flex flex-1 flex-col space-y-6 overflow-auto">
        <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="mb-1 text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="text-muted-foreground text-base font-normal">
              Track your payment schedule
            </p>
          </div>

          <div className="glass-card flex items-center gap-4 self-start px-4 py-2 lg:self-auto">
            <button
              onClick={goToToday}
              className="text-muted-foreground hover:text-foreground font-[family-name:var(--font-mono)] text-[11px] font-bold tracking-widest uppercase"
            >
              Today
            </button>
            <div className="bg-border hidden h-4 w-px md:block" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigateMonth(-1)}
                aria-label="Previous month"
                className="text-foreground hover:bg-muted rounded-lg p-1.5"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="text-foreground min-w-[140px] text-center font-[family-name:var(--font-heading)] text-lg font-bold">
                {dayjs(currentDate).format('MMMM YYYY')}
              </span>
              <button
                onClick={() => navigateMonth(1)}
                aria-label="Next month"
                className="text-foreground hover:bg-muted rounded-lg p-1.5"
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

        <div className="glass-card flex flex-1 flex-col overflow-hidden p-1">
          <div className="border-border grid grid-cols-7 border-b">
            {WEEKDAYS_FULL.map((day, i) => (
              <div
                key={day}
                className="text-muted-foreground py-3 text-center font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase"
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{WEEKDAYS_SHORT[i]}</span>
              </div>
            ))}
          </div>

          <div className="grid flex-1 auto-rows-fr grid-cols-7 overflow-y-auto">
            {Array.from({ length: firstDayOffset }).map((_, i) => (
              <div
                key={`empty-${i}`}
                className="border-border flex min-h-[60px] flex-col gap-1 border bg-[var(--color-subtle-overlay)] p-1 sm:min-h-[100px] sm:p-2"
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

      {/* On small screens, overlay the panel; on lg+, it sits beside the calendar */}
      {selectedDate !== null && (
        <button
          type="button"
          aria-label="Close panel"
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSelectedDate(null)}
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 right-0 z-50 w-full max-w-[380px] transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 lg:transition-none',
          selectedDate !== null ? 'translate-x-0' : 'translate-x-full lg:hidden'
        )}
      >
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
    </div>
  )
}
