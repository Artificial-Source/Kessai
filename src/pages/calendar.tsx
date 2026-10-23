import { useState, useEffect, useCallback } from 'react'
import dayjs from 'dayjs'
import { CalendarCheck, CalendarX2, ChevronLeft, ChevronRight, Plus, RotateCw } from 'lucide-react'
import { CalendarDay } from '@/components/calendar/calendar-day'
import { CalendarDayPanel } from '@/components/calendar/calendar-day-panel'
import {
  MonthSummaryHeader,
  MonthSummarySkeleton,
} from '@/components/calendar/month-summary-header'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Kbd } from '@/components/ui/kbd'
import { Skeleton } from '@/components/ui/skeleton'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { useCalendarStats } from '@/hooks/use-calendar-stats'
import { useMediaQuery } from '@/hooks/use-media-query'
import { usePaymentStore } from '@/stores/payment-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'

const WEEKDAYS = [
  ['Sun', 'S'],
  ['Mon', 'M'],
  ['Tue', 'T'],
  ['Wed', 'W'],
  ['Thu', 'T'],
  ['Fri', 'F'],
  ['Sat', 'S'],
] as const

const MONTH_LABEL_ID = 'calendar-month-label'

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  // The day panel sits beside the grid from lg up; below that it is a dialog.
  const isWide = useMediaQuery('(min-width: 1024px)')

  const fetchSettings = useSettingsStore((state) => state.fetch)
  const settingsError = useSettingsStore((state) => state.error)
  const currency = useSettingsStore((state) => state.settings?.currency || 'USD')
  const subscriptionsError = useSubscriptionStore((state) => state.error)
  const fetchSubscriptions = useSubscriptionStore((state) => state.fetch)
  const hasNoSubscriptions = useSubscriptionStore(
    (state) => !state.isLoading && !state.error && state.subscriptions.length === 0
  )
  const fetchCategories = useCategoryStore((state) => state.fetch)

  const {
    calendarDays,
    monthStats,
    getPaymentsForDate,
    refetchPayments,
    isLoading,
    isRefreshing,
    error: calendarError,
  } = useCalendarStats(currentDate, currency)
  // Skeletons only stand in for a month that has nothing to show yet; a refetch after a
  // payment keeps the current occurrences on screen (the grid is aria-busy meanwhile).
  const showSkeleton = isLoading && !isRefreshing
  const { markAsPaid, skipPayment } = usePaymentStore()
  const { openSubscriptionDialog } = useUiStore()

  useEffect(() => {
    fetchSettings()
    fetchSubscriptions()
    fetchCategories()
  }, [fetchSettings, fetchSubscriptions, fetchCategories])

  const selectedPayments = selectedDate ? getPaymentsForDate(selectedDate) : []
  const monthStart = dayjs(currentDate).startOf('month')
  const leadingBlanks = monthStart.day()
  const trailingBlanks = (7 - ((leadingBlanks + monthStart.daysInMonth()) % 7)) % 7
  const monthLabel = monthStart.format('MMMM YYYY')

  const navigateMonth = useCallback((delta: number) => {
    setCurrentDate((prev) => dayjs(prev).add(delta, 'month').toDate())
    setSelectedDate(null)
  }, [])

  const goToToday = useCallback(() => {
    const today = new Date()
    setCurrentDate(today)
    setSelectedDate(today)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
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
          if (!e.metaKey && !e.ctrlKey && !e.altKey) goToToday()
          break
        case 'Escape':
          setSelectedDate(null)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigateMonth, goToToday])

  const refreshAfterPayment = async () => {
    await Promise.all([fetchSubscriptions(), refetchPayments()])
  }

  const closePanel = useCallback(() => setSelectedDate(null), [])

  const panel = (
    <CalendarDayPanel
      layout={isWide ? 'side' : 'dialog'}
      isOpen={selectedDate !== null}
      selectedDate={selectedDate}
      payments={selectedPayments}
      currency={currency}
      isLoading={showSkeleton}
      error={calendarError}
      onClose={closePanel}
      onMarkPaid={markAsPaid}
      onSkip={skipPayment}
      onEdit={openSubscriptionDialog}
      onRefresh={refreshAfterPayment}
    />
  )

  return (
    <div className="animate-fade-in-up flex flex-col gap-6 lg:flex-row lg:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Calendar</h1>
            <p className="text-muted-foreground text-sm">Track your payment schedule</p>
          </div>

          <div role="group" aria-label="Month" className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="mr-auto lg:order-last lg:mr-0 lg:ml-2"
              onClick={goToToday}
              aria-keyshortcuts="T"
              title="Go to today (T)"
            >
              Today
              <Kbd aria-hidden="true" className="hidden h-5 min-w-5 md:inline-flex">
                T
              </Kbd>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(-1)}
              aria-label="Previous month"
              aria-keyshortcuts="PageUp"
              title="Previous month (Page Up)"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <h2
              id={MONTH_LABEL_ID}
              aria-live="polite"
              className="text-foreground min-w-[9.5rem] text-center text-lg font-bold tabular-nums"
            >
              {monthLabel}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateMonth(1)}
              aria-label="Next month"
              aria-keyshortcuts="PageDown"
              title="Next month (Page Down)"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </header>

        <WebBackendBanner error={subscriptionsError || settingsError} />

        {calendarError ? (
          <div role="alert">
            <EmptyState
              icon={CalendarX2}
              tone="danger"
              title={`Couldn’t load ${monthLabel}`}
              description="The payments for this month didn’t load. Check that Kessai is running, then retry."
              action={
                <Button
                  variant="outline"
                  onClick={() => void refetchPayments().catch(() => undefined)}
                >
                  <RotateCw aria-hidden="true" />
                  Retry
                </Button>
              }
            >
              <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs break-all">
                {calendarError}
              </p>
            </EmptyState>
          </div>
        ) : (
          <>
            {showSkeleton ? (
              <MonthSummarySkeleton />
            ) : monthStats.paymentCount === 0 ? (
              <Card padding="none">
                <EmptyState
                  icon={CalendarCheck}
                  variant="plain"
                  size="compact"
                  title={`No payments in ${monthLabel}`}
                  description={
                    hasNoSubscriptions
                      ? 'Add a subscription and its renewal dates appear on this calendar.'
                      : 'Nothing renews this month.'
                  }
                  action={
                    hasNoSubscriptions ? (
                      <Button onClick={() => openSubscriptionDialog()}>
                        <Plus aria-hidden="true" />
                        Add Subscription
                      </Button>
                    ) : null
                  }
                />
              </Card>
            ) : (
              <MonthSummaryHeader monthLabel={monthLabel} currency={currency} {...monthStats} />
            )}

            <Card asChild padding="none" className="overflow-hidden">
              <section aria-labelledby={MONTH_LABEL_ID} aria-busy={isLoading}>
                <div className="border-border grid grid-cols-7 border-b" aria-hidden="true">
                  {WEEKDAYS.map(([full, short], i) => (
                    <div
                      key={`${full}-${i}`}
                      className="type-label text-muted-foreground py-2.5 text-center"
                    >
                      <span className="hidden sm:inline">{full}</span>
                      <span className="sm:hidden">{short}</span>
                    </div>
                  ))}
                </div>

                <div className="bg-border grid grid-cols-7 gap-px">
                  {Array.from({ length: leadingBlanks }, (_, i) => (
                    <div key={`lead-${i}`} aria-hidden="true" className="bg-background" />
                  ))}

                  {showSkeleton
                    ? calendarDays.map((day) => (
                        <div
                          key={day.date.toISOString()}
                          aria-hidden="true"
                          className="bg-background flex min-h-14 flex-col gap-1.5 p-1.5 sm:min-h-[6.5rem] sm:p-2"
                        >
                          <span className="text-muted-foreground inline-flex size-6 items-center justify-center font-[family-name:var(--font-mono)] text-xs font-bold">
                            {day.dayOfMonth}
                          </span>
                          <Skeleton className="hidden h-4 w-3/4 sm:block" />
                        </div>
                      ))
                    : calendarDays.map((day) => (
                        <CalendarDay
                          key={day.date.toISOString()}
                          date={day.date}
                          isToday={day.isToday}
                          isSelected={
                            selectedDate !== null && dayjs(selectedDate).isSame(day.date, 'day')
                          }
                          payments={day.payments}
                          displayCurrency={currency}
                          opensDialog={!isWide}
                          onSelect={setSelectedDate}
                        />
                      ))}

                  {Array.from({ length: trailingBlanks }, (_, i) => (
                    <div key={`trail-${i}`} aria-hidden="true" className="bg-background" />
                  ))}
                </div>

                {showSkeleton ? (
                  <p role="status" className="sr-only">
                    Loading payments for {monthLabel}
                  </p>
                ) : null}
              </section>
            </Card>
          </>
        )}
      </div>

      {panel}
    </div>
  )
}
