import { useId, useMemo, useRef, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarDays, SkipForward, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/currency'
import { findSubscriptionFocus, refocusIfLost } from '@/lib/focus'
import { excludedCurrenciesNote } from '@/lib/totals'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { DayPaymentItem } from './day-payment-item'
import { paymentCountLabel, summarizeDay } from './day-summary'
import type { DayPayment } from '@/hooks/use-calendar-stats'
import type { Payment } from '@/types/payment'

interface CalendarDayPanelProps {
  /** `side` sits beside the grid (lg and up); `dialog` is the modal used on smaller screens. */
  layout?: 'side' | 'dialog'
  isOpen: boolean
  selectedDate: Date | null
  payments: DayPayment[]
  currency?: string
  isLoading?: boolean
  error?: string | null
  onClose: () => void
  onMarkPaid: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  onSkip: (subscriptionId: string, dueDate: string, amount: number) => Promise<Payment>
  onEdit: (subscriptionId: string) => void
  onRefresh: () => Promise<void>
}

const REFRESH_FAILED = 'The calendar could not be refreshed.'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function CalendarDayPanel({
  layout = 'side',
  isOpen,
  selectedDate,
  payments,
  currency = 'USD',
  isLoading = false,
  error = null,
  onClose,
  onMarkPaid,
  onSkip,
  onEdit,
  onRefresh,
}: CalendarDayPanelProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const running = useRef(false)
  const [isRunning, setIsRunning] = useState(false)
  const summary = useMemo(() => summarizeDay(payments, currency), [payments, currency])
  const unpaidPayments = useMemo(
    () => payments.filter((p) => !p.isPaid && !p.isSkipped),
    [payments]
  )

  if (!isOpen || !selectedDate) return null

  /** Refreshes the calendar and subscriptions; returns a note when that fails. */
  const refresh = async (): Promise<string | null> => {
    try {
      await onRefresh()
      return null
    } catch {
      return REFRESH_FAILED
    }
  }

  const handleSingle = async (payment: DayPayment, action: CalendarDayPanelProps['onMarkPaid']) => {
    if (running.current) return
    running.current = true
    setIsRunning(true)
    const { name, id } = payment.subscription
    try {
      const outcome = await action(id, payment.dueDate, payment.amount)
      const refreshNote = await refresh()
      const next = useSubscriptionStore.getState().subscriptions.find((s) => s.id === id)
      const nextNote =
        next?.next_payment_date && next.next_payment_date > payment.dueDate
          ? `Next payment ${dayjs(next.next_payment_date).format('MMM D, YYYY')}.`
          : null
      const description = [nextNote, refreshNote].filter(Boolean).join(' ') || undefined
      if (outcome.status === 'skipped') {
        // A skip is a decision, not a success: neutral icon, no green check.
        toast(`Skipped ${name}`, {
          description,
          icon: <SkipForward className="size-4" aria-hidden="true" />,
        })
      } else {
        toast.success(`Marked ${name} as paid`, { description })
      }
    } catch (actionError) {
      toast.error(`Couldn't record ${name}`, { description: errorMessage(actionError) })
    } finally {
      running.current = false
      setIsRunning(false)
      // The buttons were disabled while saving and are gone once the payment is recorded:
      // keep focus on this payment rather than letting it fall to the page.
      refocusIfLost(
        () => findSubscriptionFocus(id, panelRef.current) ?? headingRef.current,
        panelRef.current
      )
    }
  }

  const handleMarkAllPaid = async () => {
    if (running.current) return
    running.current = true
    setIsRunning(true)
    try {
      const results = await Promise.allSettled(
        unpaidPayments.map((payment) =>
          onMarkPaid(payment.subscription.id, payment.dueDate, payment.amount)
        )
      )
      const failures: string[] = []
      let paid = 0
      let alreadySkipped = 0
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          failures.push(
            `${unpaidPayments[index].subscription.name}: ${errorMessage(result.reason)}`
          )
        } else if (result.value.status === 'paid') {
          paid++
        } else {
          alreadySkipped++
        }
      })
      const refreshNote = await refresh()
      const total = results.length
      const description =
        [
          failures.length > 0 ? `${failures.join('; ')}.` : null,
          alreadySkipped > 0 ? `${alreadySkipped} already recorded as skipped.` : null,
          refreshNote,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      const title =
        paid === total
          ? `Marked ${paymentCountLabel(total)} as paid`
          : `Marked ${paid} of ${paymentCountLabel(total)} as paid`
      const report = failures.length > 0 ? toast.error : toast.success
      report(title, { description })
    } finally {
      running.current = false
      setIsRunning(false)
      // Mark all is gone once the day is resolved: the day heading and its summary are next.
      refocusIfLost(() => headingRef.current, panelRef.current)
    }
  }

  const title = dayjs(selectedDate).format('dddd, MMMM D')
  const ready = !isLoading && !error
  const exclusionNote = excludedCurrenciesNote(summary.excludedCurrencies)
  // The body carries the loading and error states; the header only summarizes a loaded day.
  const status =
    unpaidPayments.length > 0
      ? `${unpaidPayments.length} due`
      : summary.paidCount === payments.length
        ? 'all paid'
        : 'all recorded'
  const description = !ready
    ? null
    : payments.length === 0
      ? 'No payments due'
      : `${paymentCountLabel(payments.length)} · ${formatCurrency(summary.total, summary.currency)} · ${status}`

  const body = error ? (
    <p role="alert" className="text-destructive text-sm">
      Couldn&rsquo;t load payments for this day. Retry from the calendar.
    </p>
  ) : isLoading ? (
    <div role="status" className="flex flex-col gap-4">
      <span className="text-muted-foreground text-sm">Loading payments…</span>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3" aria-hidden="true">
          <Skeleton className="size-10 shrink-0" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
      ))}
    </div>
  ) : payments.length > 0 ? (
    <ul className="divide-border flex flex-col divide-y">
      {payments.map((payment) => (
        <DayPaymentItem
          key={payment.id ?? `${payment.subscription.id}:${payment.dueDate}`}
          subscription={payment.subscription}
          amount={payment.amount}
          isPaid={payment.isPaid}
          isSkipped={payment.isSkipped}
          disabled={isRunning}
          onMarkPaid={() => void handleSingle(payment, onMarkPaid)}
          onSkip={() => void handleSingle(payment, onSkip)}
          onEdit={() => onEdit(payment.subscription.id)}
        />
      ))}
    </ul>
  ) : (
    <EmptyState
      icon={CalendarDays}
      variant="plain"
      size="compact"
      headingLevel="h3"
      title="No payments due"
      description="Nothing renews on this day."
    />
  )

  const markAll =
    ready && unpaidPayments.length > 0 ? (
      <Button
        onClick={() => void handleMarkAllPaid()}
        disabled={isRunning}
        aria-busy={isRunning}
        className="w-full"
      >
        Mark all as paid
      </Button>
    ) : null

  if (layout === 'dialog') {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          ref={panelRef}
          className="flex flex-col overflow-hidden sm:max-w-md"
          {...(description ? {} : { 'aria-describedby': undefined })}
        >
          <DialogHeader>
            <DialogTitle ref={headingRef} tabIndex={-1} className="rounded-sm">
              {title}
            </DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
            {ready && exclusionNote ? (
              <p className="text-muted-foreground text-xs">{exclusionNote}</p>
            ) : null}
          </DialogHeader>
          {/* 4px of block padding keeps a focused item's ring clear of the scroll edge. */}
          <div className="-mx-6 -my-1 min-h-0 flex-1 overflow-y-auto px-6 py-1">{body}</div>
          {markAll ? <DialogFooter>{markAll}</DialogFooter> : null}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <aside
      ref={panelRef}
      aria-labelledby={titleId}
      className="glass-overlay animate-slide-in-right flex max-h-[calc(100dvh-5.5rem)] w-full flex-col overflow-hidden lg:sticky lg:top-0 lg:w-[22rem] lg:shrink-0"
    >
      <header className="border-border flex items-start justify-between gap-3 border-b p-5">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            ref={headingRef}
            id={titleId}
            tabIndex={-1}
            className="text-foreground rounded-sm text-xl leading-tight font-bold tracking-tight"
          >
            {title}
          </h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          {ready && exclusionNote ? (
            <p className="text-muted-foreground text-xs">{exclusionNote}</p>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="-mt-1 -mr-1"
          onClick={onClose}
          aria-label="Close day details"
          aria-keyshortcuts="Escape"
        >
          <X aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{body}</div>
      {markAll ? <div className="border-border border-t p-5">{markAll}</div> : null}
    </aside>
  )
}
