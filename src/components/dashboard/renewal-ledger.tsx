import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  RotateCw,
  SkipForward,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useFocusAfterRemoval } from '@/hooks/use-focus-after-removal'
import { useMediaQuery } from '@/hooks/use-media-query'
import { excludedCount, listCurrencies, plural } from '@/lib/commitment'
import { formatCurrency } from '@/lib/currency'
import { formatDateRange } from '@/lib/renewal-ledger'
import { cn } from '@/lib/utils'
import { usePaymentStore } from '@/stores/payment-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useUiStore } from '@/stores/ui-store'
import { LEDGER_FOCUS_ATTRIBUTE, LedgerRow, type LedgerRowState } from './ledger-row'
import type { LedgerEntry, LedgerGroupId, RenewalLedger as Ledger } from '@/lib/renewal-ledger'
import type { Subscription } from '@/types/subscription'

/** Rows shown before "View all": about the next week on a desktop screen. */
export const LEDGER_PREVIEW_ROWS = 6

const GROUP_LABELS: Record<LedgerGroupId, string> = {
  today: 'Today',
  week: 'Next 7 days',
  later: 'Later',
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

interface RenewalLedgerProps {
  ledger: Ledger
  displayCurrency: string
  isLoading: boolean
  error: string | null
  onRetry: () => Promise<void>
  /** The soonest renewal after the window, for the "nothing in 30 days" state. */
  nextRenewal: Subscription | null
}

/**
 * Upcoming charges for the next 30 days, grouped Today / Next 7 days / Later, each
 * resolvable in place. Rows are full charges in their own currency; the subtotal sums the
 * display currency only and says what it leaves out. Earlier unrecorded dates of this month
 * sit in their own folded group and never count as coming charges.
 */
export function RenewalLedger({
  ledger,
  displayCurrency,
  isLoading,
  error,
  onRetry,
  nextRenewal,
}: RenewalLedgerProps) {
  const titleId = useId()
  const listId = useId()
  const earlierId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const wideActions = useMediaQuery('(min-width: 640px)')
  const markAsPaid = usePaymentStore((s) => s.markAsPaid)
  const skipPayment = usePaymentStore((s) => s.skipPayment)
  const fetchSubscriptions = useSubscriptionStore((s) => s.fetch)
  const openSubscriptionDialog = useUiStore((s) => s.openSubscriptionDialog)

  const [showAll, setShowAll] = useState(false)
  const [showEarlier, setShowEarlier] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [rows, setRows] = useState<Record<string, LedgerRowState>>({})
  const running = useRef(new Set<string>())

  const { upcoming, groups, earlier, subtotal, window: range } = ledger
  const visible = showAll ? upcoming : upcoming.slice(0, LEDGER_PREVIEW_ROWS)
  const visibleKeys = useMemo(() => new Set(visible.map((entry) => entry.key)), [visible])
  // A recorded row leaves the list when the schedule refreshes, taking its focused name
  // with it; focus then moves to the row that took its place.
  const { expectRemoval, keepFocusOn } = useFocusAfterRemoval(
    rootRef,
    headingRef,
    LEDGER_FOCUS_ATTRIBUTE,
    [...visible, ...(showEarlier ? earlier : [])].map((entry) => entry.key)
  )

  const record = useCallback(
    async (entry: LedgerEntry, action: 'paid' | 'skipped') => {
      if (running.current.has(entry.key)) return
      running.current.add(entry.key)
      setRows((previous) => ({
        ...previous,
        [entry.key]: { busy: action, outcome: null, error: null },
      }))
      try {
        const write = action === 'paid' ? markAsPaid : skipPayment
        const payment = await write(entry.subscriptionId, entry.dueDate, entry.amount)
        const outcome = payment.status === 'skipped' ? 'skipped' : 'paid'
        setRows((previous) => ({ ...previous, [entry.key]: { busy: null, outcome, error: null } }))
        expectRemoval(entry.key)
        const description = `${dayjs(entry.dueDate).format('MMM D')} · ${formatCurrency(entry.amount, entry.currency)}`
        if (outcome === 'skipped') {
          // A skip is a decision, not a success: neutral icon, no green check.
          toast(`Skipped ${entry.name}`, {
            description,
            icon: <SkipForward className="size-4" aria-hidden="true" />,
          })
        } else {
          toast.success(`Marked ${entry.name} as paid`, { description })
        }
        // Recording the current due date moves the next payment date forward.
        void fetchSubscriptions()
      } catch (actionError) {
        const message = errorMessage(actionError)
        setRows((previous) => ({
          ...previous,
          [entry.key]: { busy: null, outcome: null, error: message },
        }))
        toast.error(`Couldn't record ${entry.name}`, { description: message })
      } finally {
        running.current.delete(entry.key)
        // The pressed button was disabled while saving, then replaced by the outcome:
        // keep focus on this charge rather than letting it fall to the page.
        keepFocusOn(entry.key)
      }
    },
    [markAsPaid, skipPayment, fetchSubscriptions, expectRemoval, keepFocusOn]
  )
  const handleMarkPaid = useCallback((entry: LedgerEntry) => void record(entry, 'paid'), [record])
  const handleSkip = useCallback((entry: LedgerEntry) => void record(entry, 'skipped'), [record])

  const retry = async () => {
    setRetrying(true)
    try {
      await onRetry()
    } catch {
      // The failed month keeps its error; the state below stays visible.
    } finally {
      setRetrying(false)
    }
  }

  const foreignCount = excludedCount(subtotal.excludedCurrencies)
  const currencies = listCurrencies(subtotal.excludedCurrencies)
  const ready = !isLoading && !error
  const allForeign = ready && upcoming.length > 0 && subtotal.count === 0

  const renderRow = (entry: LedgerEntry) => (
    <LedgerRow
      key={entry.key}
      entry={entry}
      displayCurrency={displayCurrency}
      wideActions={wideActions}
      state={rows[entry.key]}
      onMarkPaid={handleMarkPaid}
      onSkip={handleSkip}
      onEdit={openSubscriptionDialog}
    />
  )

  let body: ReactNode
  if (error) {
    body = (
      <EmptyState
        icon={AlertTriangle}
        tone="danger"
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="Couldn’t load upcoming charges"
        description="The monthly figures above are unaffected. Charges show here once the schedule loads."
        action={
          <Button variant="outline" onClick={retry} disabled={retrying} aria-busy={retrying}>
            <RotateCw className={cn(retrying && 'animate-spin')} aria-hidden="true" />
            Retry
          </Button>
        }
      />
    )
  } else if (isLoading) {
    body = (
      <div role="status" className="divide-border mt-2 divide-y">
        <span className="sr-only">Loading upcoming charges</span>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} aria-hidden="true" className="flex items-center gap-3 py-3.5">
            <Skeleton className="size-9 rounded-md" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-36 max-w-full" />
              <Skeleton className="h-3 w-24 max-w-full" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    )
  } else if (upcoming.length === 0) {
    body = (
      <EmptyState
        icon={CalendarCheck}
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="No charges scheduled in the next 30 days"
        description={
          nextRenewal?.next_payment_date
            ? `The next known renewal is ${nextRenewal.name} on ${dayjs(nextRenewal.next_payment_date).format('MMM D, YYYY')}.`
            : 'Paused and cancelled subscriptions are not scheduled.'
        }
        action={
          <Button asChild variant="outline">
            <Link to="/calendar">
              <CalendarDays aria-hidden="true" />
              Open calendar
            </Link>
          </Button>
        }
      />
    )
  } else {
    body = (
      <div id={listId} className="mt-1 flex flex-col">
        {groups.map((group) => {
          const entries = group.entries.filter((entry) => visibleKeys.has(entry.key))
          if (entries.length === 0) return null
          const headingId = `${listId}-${group.id}`
          return (
            <section key={group.id} aria-labelledby={headingId} className="pt-3">
              <h3
                id={headingId}
                className="type-label text-muted-foreground border-border border-b pb-2"
              >
                {GROUP_LABELS[group.id]}
                <span aria-hidden="true"> · </span>
                <span className="sr-only">, </span>
                {group.id === 'today'
                  ? dayjs(group.start).format('ddd, MMM D')
                  : formatDateRange(group.start, group.end)}
              </h3>
              <ul className="divide-border divide-y">{entries.map(renderRow)}</ul>
            </section>
          )
        })}
      </div>
    )
  }

  return (
    <Card asChild padding="none" className="min-w-0 p-4 sm:p-5">
      <section ref={rootRef} aria-labelledby={titleId}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2
              ref={headingRef}
              id={titleId}
              tabIndex={-1}
              className="text-foreground rounded-sm text-lg leading-tight font-bold tracking-tight"
            >
              Upcoming charges
            </h2>
            <p className="text-muted-foreground text-sm">
              <span className="whitespace-nowrap">{formatDateRange(range.start, range.end)}</span>
              {ready && upcoming.length > 0 ? (
                <>
                  <span aria-hidden="true"> · </span>
                  <span className="sr-only">, </span>
                  <span className="whitespace-nowrap">{plural(upcoming.length, 'charge')}</span>
                </>
              ) : null}
            </p>
          </div>
          {ready && subtotal.count > 0 ? (
            <div className="shrink-0 text-right">
              <p className="text-foreground font-[family-name:var(--font-mono)] text-base font-bold whitespace-nowrap tabular-nums">
                {formatCurrency(subtotal.amount, displayCurrency)}
              </p>
              <p className="type-label text-muted-foreground">{displayCurrency} full charges</p>
            </div>
          ) : null}
        </div>
        {ready && foreignCount > 0 ? (
          <p className="text-muted-foreground mt-2 text-sm text-pretty">
            {allForeign
              ? `No ${displayCurrency} charges in this period · ${plural(foreignCount, 'charge')} in ${currencies}, not converted.`
              : `${plural(foreignCount, 'charge')} in ${currencies} ${foreignCount === 1 ? 'is' : 'are'} not in this total.`}
          </p>
        ) : null}

        <div className="@container">{body}</div>

        {ready && upcoming.length > 0 ? (
          <div className="border-border mt-1 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            {upcoming.length > LEDGER_PREVIEW_ROWS ? (
              <Button
                variant="ghost"
                size="sm"
                aria-expanded={showAll}
                aria-controls={listId}
                onClick={() => setShowAll((value) => !value)}
              >
                <ChevronDown
                  className={cn('transition-transform', showAll && 'rotate-180')}
                  aria-hidden="true"
                />
                {showAll ? 'Show fewer' : `View all ${plural(upcoming.length, 'charge')}`}
              </Button>
            ) : (
              <span />
            )}
            <Button asChild variant="ghost" size="sm">
              <Link to="/calendar">
                <CalendarDays aria-hidden="true" />
                Open calendar
              </Link>
            </Button>
          </div>
        ) : null}

        {ready && earlier.length > 0 ? (
          <div className="border-border mt-3 border-t pt-2">
            <div className="-mx-2">
              <button
                type="button"
                aria-expanded={showEarlier}
                aria-controls={earlierId}
                onClick={() => setShowEarlier((value) => !value)}
                className="hover:bg-accent-muted flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-foreground block text-sm font-medium">
                    Earlier this month · no payment recorded
                  </span>
                  <span className="text-muted-foreground block text-xs">
                    {plural(earlier.length, 'due date')} before today, not in the total above
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    'text-muted-foreground size-4 shrink-0 transition-transform',
                    showEarlier && 'rotate-180'
                  )}
                  aria-hidden="true"
                />
              </button>
            </div>
            {showEarlier ? (
              <div id={earlierId} className="@container">
                <ul className="divide-border divide-y" aria-label="Earlier this month">
                  {earlier.map(renderRow)}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </Card>
  )
}
