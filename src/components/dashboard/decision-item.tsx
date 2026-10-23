import { memo, type ReactNode } from 'react'
import dayjs from 'dayjs'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { formatAmount, formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { DecisionAction, DecisionActionState } from '@/hooks/use-decision-actions'
import type { Decision, ReviewCandidate } from '@/lib/dashboard-decisions'
import type { Subscription } from '@/types/subscription'

/** Marks a decision's name as the place focus returns to after it resolves. */
export const DECISION_FOCUS_ATTRIBUTE = 'data-decision-focus'

const day = (date: string) => dayjs(date).format('MMM D')

const recordedPrice = (subscription: Subscription) =>
  `${formatAmount(subscription.amount, subscription.currency)}${BILLING_CYCLE_SHORT[subscription.billing_cycle]}`

function trialBadge(daysLeft: number): { variant: BadgeVariant; label: string } {
  if (daysLeft < 0) return { variant: 'danger', label: 'Trial ended' }
  if (daysLeft === 0) return { variant: 'warning', label: 'Trial ends today' }
  if (daysLeft === 1) return { variant: 'warning', label: 'Trial ends tomorrow' }
  return { variant: 'info', label: `Trial ends in ${daysLeft} days` }
}

interface ItemShellProps {
  focusKey: string
  name: string
  badge?: ReactNode
  aside?: ReactNode
  children: ReactNode
  actions: ReactNode
  error?: string | null
  className?: string
}

/** Name (focus target), status, the facts behind it, then the actions that settle it. */
function ItemShell({
  focusKey,
  name,
  badge,
  aside,
  children,
  actions,
  error,
  className,
}: ItemShellProps) {
  return (
    <li className={cn('flex flex-col gap-2 py-3 first:pt-2 last:pb-0', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col items-start gap-1.5">
          <span
            tabIndex={-1}
            {...{ [DECISION_FOCUS_ATTRIBUTE]: focusKey }}
            className="text-foreground max-w-full truncate rounded-sm text-sm font-medium focus-visible:outline-offset-1"
            title={name}
          >
            {name}
          </span>
          {badge}
        </div>
        {aside}
      </div>
      <div className="text-muted-foreground flex flex-col gap-1 text-xs leading-relaxed">
        {children}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-0.5">{actions}</div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          Couldn&rsquo;t save. {error}
        </p>
      ) : null}
    </li>
  )
}

function ActionButton({
  label,
  ariaLabel,
  busy,
  disabled,
  variant = 'ghost',
  onClick,
}: {
  label: string
  ariaLabel?: string
  busy: boolean
  disabled: boolean
  variant?: 'ghost' | 'outline'
  onClick: () => void
}) {
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={disabled}
      aria-busy={busy || undefined}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
      {label}
    </Button>
  )
}

interface DecisionItemProps {
  decision: Decision
  state?: DecisionActionState
  onReview: (subscriptionId: string) => void
  onAction: (key: string, subscription: Subscription, action: DecisionAction) => void
  className?: string
}

/** A trial deadline, grace period, or recorded price change, with Review and a quick fix. */
export const DecisionItem = memo(function DecisionItem({
  decision,
  state,
  onReview,
  onAction,
  className,
}: DecisionItemProps) {
  const { subscription } = decision
  const busy = state?.busy ?? null
  const review = (
    <ActionButton
      label="Review"
      ariaLabel={`Review ${subscription.name}`}
      variant="outline"
      busy={false}
      disabled={busy !== null}
      onClick={() => onReview(subscription.id)}
    />
  )

  if (decision.kind === 'trial') {
    const badge = trialBadge(decision.daysLeft)
    const ended = decision.daysLeft < 0
    return (
      <ItemShell
        focusKey={decision.id}
        className={className}
        name={subscription.name}
        badge={
          <Badge variant={badge.variant} size="sm">
            {badge.label}
          </Badge>
        }
        error={state?.error}
        actions={
          <>
            {review}
            <ActionButton
              label="Keep"
              ariaLabel={`Keep ${subscription.name} and record it as active`}
              busy={busy === 'keep-trial'}
              disabled={busy !== null}
              onClick={() => onAction(decision.id, subscription, 'keep-trial')}
            />
          </>
        }
      >
        <p>
          {ended ? 'Ended' : 'Ends'} {day(subscription.trial_end_date!)} ·{' '}
          {recordedPrice(subscription)} recorded
          {subscription.next_payment_date
            ? ` · next payment ${day(subscription.next_payment_date)}`
            : ''}
        </p>
        {decision.datesConflict ? (
          <p className="text-warning flex items-start gap-1.5">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Check dates: the next payment is before the trial ends.
          </p>
        ) : ended ? (
          <p>Review its status: Kessai doesn&rsquo;t know whether the provider charged.</p>
        ) : null}
      </ItemShell>
    )
  }

  if (decision.kind === 'grace-period') {
    return (
      <ItemShell
        focusKey={decision.id}
        className={className}
        name={subscription.name}
        badge={
          <Badge variant="warning" size="sm">
            Grace period
          </Badge>
        }
        error={state?.error}
        actions={review}
      >
        <p>
          {subscription.status_changed_at ? `Since ${day(subscription.status_changed_at)} · ` : ''}
          {recordedPrice(subscription)} recorded
          {subscription.next_payment_date
            ? ` · next payment ${day(subscription.next_payment_date)}`
            : ''}
        </p>
      </ItemShell>
    )
  }

  const { change, sameCurrency } = decision
  return (
    <ItemShell
      focusKey={decision.id}
      className={className}
      name={subscription.name}
      badge={
        <Badge variant={sameCurrency ? 'warning' : 'info'} size="sm">
          {sameCurrency ? 'Price went up' : 'Currency changed'}
        </Badge>
      }
      error={state?.error}
      actions={
        <>
          {review}
          <ActionButton
            label="Mark reviewed"
            ariaLabel={`Mark ${subscription.name} as reviewed`}
            busy={busy === 'mark-reviewed'}
            disabled={busy !== null}
            onClick={() => onAction(decision.id, subscription, 'mark-reviewed')}
          />
        </>
      }
    >
      <p className="font-[family-name:var(--font-mono)] tabular-nums">
        {formatCurrency(change.old_amount, change.old_currency)}
        {sameCurrency ? '' : ` ${change.old_currency}`} →{' '}
        <span className="text-foreground font-bold">
          {formatCurrency(change.new_amount, change.new_currency)}
          {sameCurrency ? '' : ` ${change.new_currency}`}
        </span>
        {sameCurrency
          ? ` · +${formatCurrency(change.new_amount - change.old_amount, change.new_currency)} per charge`
          : ''}
      </p>
      <p>Recorded {day(change.changed_at)}, after your last review.</p>
    </ItemShell>
  )
})

interface CompactDecisionProps {
  decision: Decision
  onReview: (subscriptionId: string) => void
  className?: string
}

/** One line for the phone and tablet preview: name, status, the deadline, and Review. */
export const CompactDecision = memo(function CompactDecision({
  decision,
  onReview,
  className,
}: CompactDecisionProps) {
  const { subscription } = decision
  let badge: { variant: BadgeVariant; label: string }
  let detail: string
  if (decision.kind === 'trial') {
    badge = trialBadge(decision.daysLeft)
    detail = `${decision.daysLeft < 0 ? 'Ended' : 'Ends'} ${day(subscription.trial_end_date!)}`
  } else if (decision.kind === 'grace-period') {
    badge = { variant: 'warning', label: 'Grace period' }
    detail = subscription.status_changed_at
      ? `Since ${day(subscription.status_changed_at)}`
      : `${recordedPrice(subscription)} recorded`
  } else {
    const { change, sameCurrency } = decision
    badge = sameCurrency
      ? { variant: 'warning', label: 'Price went up' }
      : { variant: 'info', label: 'Currency changed' }
    detail = `${formatCurrency(change.old_amount, change.old_currency)} → ${formatCurrency(change.new_amount, change.new_currency)}`
  }

  return (
    <li className={cn('flex items-center gap-3 py-2.5', className)}>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <span
          className="text-foreground max-w-full truncate text-sm font-medium"
          title={subscription.name}
        >
          {subscription.name}
        </span>
        <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <Badge variant={badge.variant} size="sm">
            {badge.label}
          </Badge>
          <span>{detail}</span>
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        aria-label={`Review ${subscription.name}`}
        onClick={() => onReview(subscription.id)}
      >
        Review
      </Button>
    </li>
  )
})

interface ReviewItemProps {
  candidate: ReviewCandidate
  displayCurrency: string
  state?: DecisionActionState
  onReview: (subscriptionId: string) => void
  onAction: (key: string, subscription: Subscription, action: DecisionAction) => void
}

/** A subscription worth a second look, with the reason, its monthly share, Keep and Review. */
export const ReviewItem = memo(function ReviewItem({
  candidate,
  displayCurrency,
  state,
  onReview,
  onAction,
}: ReviewItemProps) {
  const { subscription, reason, since, monthlyShare } = candidate
  const key = `review:${subscription.id}`
  const busy = state?.busy ?? null
  const foreign = subscription.currency !== displayCurrency

  return (
    <ItemShell
      focusKey={key}
      name={subscription.name}
      aside={
        <p className="shrink-0 text-right">
          <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
            {formatCurrency(monthlyShare, subscription.currency)}
          </span>
          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
            /mo
          </span>
          {foreign ? (
            <span className="type-label text-muted-foreground ml-1">{subscription.currency}</span>
          ) : null}
        </p>
      }
      error={state?.error}
      actions={
        <>
          {reason === 'cancellation-pending' ? null : (
            <ActionButton
              label="Keep"
              ariaLabel={`Keep ${subscription.name} and mark it reviewed`}
              variant="outline"
              busy={busy === 'mark-reviewed'}
              disabled={busy !== null}
              onClick={() => onAction(key, subscription, 'mark-reviewed')}
            />
          )}
          <ActionButton
            label="Review"
            ariaLabel={`Review ${subscription.name}`}
            variant={reason === 'cancellation-pending' ? 'outline' : 'ghost'}
            busy={false}
            disabled={busy !== null}
            onClick={() => onReview(subscription.id)}
          />
        </>
      }
    >
      <p className={cn(reason === 'cancellation-pending' && 'text-accent-orange')}>
        {reason === 'cancellation-pending'
          ? `Cancellation pending${since ? ` since ${day(since)}` : ''}`
          : reason === 'never-reviewed'
            ? `Added ${day(since!)}, never reviewed`
            : `Last reviewed ${day(since!)}`}
        {subscription.next_payment_date && reason !== 'cancellation-pending' ? (
          <span className="text-muted-foreground">
            {' · next renewal '}
            {day(subscription.next_payment_date)}
          </span>
        ) : null}
      </p>
    </ItemShell>
  )
})
