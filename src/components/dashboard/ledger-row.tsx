import { memo, useId } from 'react'
import dayjs from 'dayjs'
import { Check, Loader2, Pencil, SkipForward } from 'lucide-react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import { formatAmount, formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { LedgerEntry } from '@/lib/renewal-ledger'

/** Marks a ledger row's name as the place focus returns to after an in-place action. */
export const LEDGER_FOCUS_ATTRIBUTE = 'data-ledger-focus'

export type LedgerRowState = {
  /** The write in flight for this occurrence. */
  busy: 'paid' | 'skipped' | null
  /** Recorded in this session; shown until the refreshed schedule drops the row. */
  outcome: 'paid' | 'skipped' | null
  error: string | null
}

interface LedgerRowProps {
  entry: LedgerEntry
  displayCurrency: string
  /** Mark paid and Skip side by side; otherwise Skip moves into the More menu (phones). */
  wideActions: boolean
  state?: LedgerRowState
  onMarkPaid: (entry: LedgerEntry) => void
  onSkip: (entry: LedgerEntry) => void
  onEdit: (subscriptionId: string) => void
}

function relativeDay(daysUntil: number, dueDate: string): string {
  if (daysUntil === 0) return 'Today'
  if (daysUntil === 1) return 'Tomorrow'
  if (daysUntil === -1) return 'Yesterday'
  return dayjs(dueDate).format('ddd')
}

/**
 * One unresolved charge: date, service, full charge in its own currency (with the user's
 * share when split), and the actions that resolve it in place. Two lines in narrow
 * containers (actions under the name), one line from 36rem, a date column from 46rem.
 */
export const LedgerRow = memo(function LedgerRow({
  entry,
  displayCurrency,
  wideActions,
  state,
  onMarkPaid,
  onSkip,
  onEdit,
}: LedgerRowProps) {
  const descriptionId = useId()
  const busy = state?.busy ?? null
  const outcome = state?.outcome ?? null
  const date = dayjs(entry.dueDate)
  const foreign = entry.currency !== displayCurrency
  const amount = formatAmount(entry.amount, entry.currency)

  const moreItems: ActionMenuItem[] = [
    ...(wideActions
      ? []
      : [{ label: 'Skip this payment', icon: SkipForward, onSelect: () => onSkip(entry) }]),
    { label: 'Edit subscription', icon: Pencil, onSelect: () => onEdit(entry.subscriptionId) },
  ]

  return (
    <li className="flex flex-col gap-2 py-3 @xl:flex-row @xl:items-center @xl:gap-4">
      <span id={descriptionId} className="sr-only">
        {`${entry.name}, due ${date.format('dddd, MMMM D')}, ${amount}${foreign ? ` ${entry.currency}` : ''}`}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="hidden w-[4.5rem] shrink-0 flex-col @min-[46rem]:flex">
          <time
            dateTime={entry.dueDate}
            className="text-foreground font-[family-name:var(--font-mono)] text-sm leading-tight font-bold tabular-nums"
          >
            {date.format('MMM D')}
          </time>
          <span className="type-label text-muted-foreground">
            {relativeDay(entry.daysUntil, entry.dueDate)}
          </span>
        </div>
        <SubscriptionLogo
          logoUrl={entry.logoUrl}
          name={entry.name}
          color={entry.color}
          decorative
          className="size-9 shrink-0 rounded-md text-xs"
        />
        <div className="min-w-0 flex-1">
          <span
            tabIndex={-1}
            {...{ [LEDGER_FOCUS_ATTRIBUTE]: entry.key }}
            className="text-foreground block truncate rounded-sm text-sm font-medium focus-visible:outline-offset-1"
            title={entry.name}
          >
            {entry.name}
          </span>
          <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <time dateTime={entry.dueDate} className="text-foreground @min-[46rem]:hidden">
              {entry.daysUntil >= -1 && entry.daysUntil <= 1
                ? `${relativeDay(entry.daysUntil, entry.dueDate)}, ${date.format('MMM D')}`
                : date.format('ddd, MMM D')}
            </time>
            <span aria-hidden="true" className="@min-[46rem]:hidden">
              ·
            </span>
            <span>{BILLING_CYCLE_LABELS[entry.billingCycle]}</span>
            {entry.status === 'trial' ? (
              <Badge variant="info" size="sm">
                Trial
              </Badge>
            ) : entry.status === 'grace_period' ? (
              <Badge variant="warning" size="sm">
                Grace period
              </Badge>
            ) : null}
          </p>
          {entry.share !== null ? (
            <p className="text-muted-foreground mt-0.5 text-xs">
              {'Your share '}
              <span className="text-foreground font-[family-name:var(--font-mono)] tabular-nums">
                {formatCurrency(entry.share, entry.currency)}
              </span>
              {` · split ${entry.sharedCount} ways`}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-right @xl:min-w-28">
          <span
            className={cn(
              'font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums',
              outcome ? 'text-muted-foreground line-through' : 'text-foreground'
            )}
          >
            {amount}
          </span>
          {foreign ? (
            <span className="type-label text-muted-foreground ml-1.5">{entry.currency}</span>
          ) : null}
        </p>
      </div>

      <div className="flex min-h-9 flex-col gap-1.5 pl-12 @xl:w-[15.5rem] @xl:shrink-0 @xl:pl-0">
        {outcome ? (
          <div className="flex items-center gap-2 @xl:justify-end">
            <Badge variant={outcome === 'paid' ? 'success' : 'secondary'}>
              {outcome === 'paid' ? (
                <Check className="size-3" aria-hidden="true" />
              ) : (
                <SkipForward className="size-3" aria-hidden="true" />
              )}
              {outcome === 'paid' ? 'Marked paid' : 'Skipped'}
            </Badge>
          </div>
        ) : (
          <div className="flex items-center gap-2 @xl:justify-end">
            <Button
              variant="outline"
              size="sm"
              className={cn(!wideActions && 'flex-1 max-sm:h-11')}
              disabled={busy !== null}
              aria-busy={busy === 'paid' || undefined}
              aria-describedby={descriptionId}
              onClick={() => onMarkPaid(entry)}
            >
              {busy === 'paid' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Mark paid
            </Button>
            {wideActions ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                aria-busy={busy === 'skipped' || undefined}
                aria-describedby={descriptionId}
                onClick={() => onSkip(entry)}
              >
                {busy === 'skipped' ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <SkipForward aria-hidden="true" />
                )}
                Skip
              </Button>
            ) : null}
            <ActionMenu
              label={`More actions for ${entry.name}, ${date.format('MMM D')}`}
              items={moreItems}
              className={cn(!wideActions && 'max-sm:size-11')}
            />
            {!wideActions && busy === 'skipped' ? (
              <span
                role="status"
                className="text-muted-foreground flex items-center gap-1.5 text-xs"
              >
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                Skipping
              </span>
            ) : null}
          </div>
        )}
        {state?.error ? (
          <p role="alert" className="text-destructive text-xs @xl:text-right">
            Couldn&rsquo;t record this payment. {state.error}
          </p>
        ) : null}
      </div>
    </li>
  )
})
