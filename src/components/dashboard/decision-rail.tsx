import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import dayjs from 'dayjs'
import { CalendarDays, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDecisionActions } from '@/hooks/use-decision-actions'
import { useFocusAfterRemoval } from '@/hooks/use-focus-after-removal'
import { excludedCount, listCurrencies, plural } from '@/lib/commitment'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import { DECISION_FOCUS_ATTRIBUTE, DecisionItem, ReviewItem } from './decision-item'
import type { Decision, ReviewCandidate } from '@/lib/dashboard-decisions'
import type { MonthRecords } from '@/lib/renewal-ledger'

/** Review candidates shown before "Review all". */
const REVIEW_PREVIEW = 3

interface DecisionRailProps {
  decisions: Decision[]
  /** Recorded price changes could not be read, so that part of Decisions is unknown. */
  priceChangesError: string | null
  candidates: ReviewCandidate[]
  displayCurrency: string
  today: string
  records: MonthRecords
  recordsState: 'loading' | 'error' | 'ready'
  onReview: (subscriptionId: string) => void
  /** ID of the Decisions heading, so the phone preview can move focus to the full list. */
  decisionsHeadingId: string
}

/**
 * The side rail (stacked under the ledger below lg): Decisions with deadlines, a short
 * Worth reviewing list, and this month's payment records.
 */
export function DecisionRail({
  decisions,
  priceChangesError,
  candidates,
  displayCurrency,
  today,
  records,
  recordsState,
  onReview,
  decisionsHeadingId,
}: DecisionRailProps) {
  return (
    <Card padding="none" className="divide-border flex min-w-0 flex-col divide-y">
      <DecisionsSection
        headingId={decisionsHeadingId}
        decisions={decisions}
        priceChangesError={priceChangesError}
        onReview={onReview}
      />
      {candidates.length > 0 ? (
        <ReviewSection
          candidates={candidates}
          displayCurrency={displayCurrency}
          onReview={onReview}
        />
      ) : null}
      <RecordsSection
        records={records}
        state={recordsState}
        displayCurrency={displayCurrency}
        today={today}
      />
    </Card>
  )
}

const sectionClass = 'flex flex-col gap-1 p-4 sm:p-5'
const titleClass = 'text-foreground rounded-sm text-base leading-tight font-bold tracking-tight'

function DecisionsSection({
  headingId,
  decisions,
  priceChangesError,
  onReview,
}: Pick<DecisionRailProps, 'decisions' | 'priceChangesError' | 'onReview'> & {
  headingId: string
}) {
  const rootRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focus = useFocusAfterRemoval(
    rootRef,
    headingRef,
    DECISION_FOCUS_ATTRIBUTE,
    decisions.map((decision) => decision.id)
  )
  const { states, run } = useDecisionActions(focus)

  return (
    <section ref={rootRef} aria-labelledby={headingId} className={sectionClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} ref={headingRef} tabIndex={-1} className={titleClass}>
          Decisions
        </h2>
        {decisions.length > 0 ? (
          <span className="type-label text-muted-foreground">{decisions.length} open</span>
        ) : null}
      </div>
      {decisions.length === 0 ? (
        <p className="text-muted-foreground text-sm">No decisions due in the next 7 days.</p>
      ) : (
        <ul className="divide-border divide-y">
          {decisions.map((decision) => (
            <DecisionItem
              key={decision.id}
              decision={decision}
              state={states[decision.id]}
              onReview={onReview}
              onAction={run}
            />
          ))}
        </ul>
      )}
      {priceChangesError ? (
        <p className="text-muted-foreground pt-2 text-xs">
          Recorded price changes couldn&rsquo;t be read, so none are listed.
        </p>
      ) : null}
    </section>
  )
}

function ReviewSection({
  candidates,
  displayCurrency,
  onReview,
}: Pick<DecisionRailProps, 'candidates' | 'displayCurrency' | 'onReview'>) {
  const titleId = useId()
  const listId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? candidates : candidates.slice(0, REVIEW_PREVIEW)
  const focus = useFocusAfterRemoval(
    rootRef,
    headingRef,
    DECISION_FOCUS_ATTRIBUTE,
    shown.map((candidate) => `review:${candidate.subscription.id}`)
  )
  const { states, run } = useDecisionActions(focus)

  return (
    <section ref={rootRef} aria-labelledby={titleId} className={sectionClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 ref={headingRef} id={titleId} tabIndex={-1} className={titleClass}>
          Worth reviewing
        </h2>
        <span className="type-label text-muted-foreground">{candidates.length}</span>
      </div>
      <p className="text-muted-foreground text-xs">
        Not reviewed in 30 days or more, highest monthly share first.
      </p>
      <ul id={listId} className="divide-border divide-y">
        {shown.map((candidate) => (
          <ReviewItem
            key={candidate.subscription.id}
            candidate={candidate}
            displayCurrency={displayCurrency}
            state={states[`review:${candidate.subscription.id}`]}
            onReview={onReview}
            onAction={run}
          />
        ))}
      </ul>
      {candidates.length > REVIEW_PREVIEW ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 -ml-2 self-start"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((value) => !value)}
        >
          <ChevronDown
            className={cn('transition-transform', showAll && 'rotate-180')}
            aria-hidden="true"
          />
          {showAll ? 'Show fewer' : `Review all ${candidates.length}`}
        </Button>
      ) : null}
    </section>
  )
}

function RecordsSection({
  records,
  state,
  displayCurrency,
  today,
}: {
  records: MonthRecords
  state: DecisionRailProps['recordsState']
  displayCurrency: string
  today: string
}) {
  const titleId = useId()
  const month = dayjs(today).format('MMMM')
  const excluded = excludedCount(records.excludedCurrencies)
  const allRecorded = records.count > 0 && records.unrecorded.count === 0

  return (
    <section aria-labelledby={titleId} className={sectionClass}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className={titleClass}>
          {month} records
        </h2>
        <Button
          asChild
          variant="link"
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          <Link to="/calendar" aria-label={`Open ${month} in Calendar`}>
            <CalendarDays aria-hidden="true" />
            Calendar
          </Link>
        </Button>
      </div>
      {state === 'loading' ? (
        <div role="status" className="flex flex-col gap-2 pt-2">
          <span className="sr-only">Loading {month} records</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : state === 'error' ? (
        <p className="text-muted-foreground text-sm">
          {month} records couldn&rsquo;t be loaded. Retry from Upcoming charges.
        </p>
      ) : records.count === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing is due in {month}.</p>
      ) : (
        <>
          <dl className="divide-border mt-1 divide-y text-sm">
            <RecordRow
              label={`${records.paid.count} marked paid`}
              amount={formatCurrency(records.paid.amount, displayCurrency)}
            />
            <RecordRow
              label={`${records.unrecorded.count} not recorded yet`}
              amount={formatCurrency(records.unrecorded.amount, displayCurrency)}
            />
            <RecordRow label={`${records.skippedCount} skipped`} amount="not added" muted />
          </dl>
          <p className="text-muted-foreground pt-2 text-xs text-pretty">
            {allRecorded ? `Every ${month} charge is marked paid or skipped. ` : ''}
            Full charges due in {month}, in {displayCurrency}
            {excluded > 0
              ? `; ${plural(excluded, 'charge')} in ${listCurrencies(records.excludedCurrencies)} counted but not added`
              : ''}
            . Kessai knows only what you record.
          </p>
        </>
      )}
    </section>
  )
}

function RecordRow({
  label,
  amount,
  muted = false,
}: {
  label: string
  amount: string
  muted?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          muted
            ? 'text-muted-foreground text-xs'
            : 'text-foreground font-[family-name:var(--font-mono)] font-bold'
        )}
      >
        {amount}
      </dd>
    </div>
  )
}
