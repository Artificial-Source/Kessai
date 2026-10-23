import { memo, useId } from 'react'
import { Check, Pencil, SkipForward } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import type { CalendarSubscription } from '@/hooks/use-calendar-stats'

interface DayPaymentItemProps {
  subscription: CalendarSubscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  disabled?: boolean
  onMarkPaid: () => void
  onSkip: () => void
  onEdit: () => void
}

/** One payment in the day panel: resolved in place with Mark paid, Skip, or Edit. */
export const DayPaymentItem = memo(function DayPaymentItem({
  subscription,
  amount,
  isPaid,
  isSkipped,
  disabled = false,
  onMarkPaid,
  onSkip,
  onEdit,
}: DayPaymentItemProps) {
  const nameId = useId()
  const isRecorded = isPaid || isSkipped

  return (
    <li className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <SubscriptionLogo
          logoUrl={subscription.logo_url}
          name={subscription.name}
          color={subscription.color}
          decorative
          className="shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <h3
            id={nameId}
            className="text-foreground truncate font-[family-name:var(--font-sans)] text-sm font-medium"
            title={subscription.name}
          >
            {subscription.name}
          </h3>
          <p
            className={
              isRecorded
                ? 'text-muted-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums line-through'
                : 'text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums'
            }
          >
            {formatCurrency(amount, subscription.currency)}
          </p>
        </div>
        {isPaid ? (
          <Badge variant="success" size="sm">
            <Check className="size-3" aria-hidden="true" />
            Paid
          </Badge>
        ) : null}
        {isSkipped ? (
          <Badge variant="secondary" size="sm">
            <SkipForward className="size-3" aria-hidden="true" />
            Skipped
          </Badge>
        ) : null}
      </div>

      {!isRecorded ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={disabled}
            onClick={onMarkPaid}
            aria-describedby={nameId}
          >
            <Check aria-hidden="true" />
            Mark paid
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onSkip}
            aria-label={`Skip payment for ${subscription.name}`}
            title="Skip this payment"
          >
            <SkipForward aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            onClick={onEdit}
            aria-label={`Edit ${subscription.name}`}
            title="Edit subscription"
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </li>
  )
})
