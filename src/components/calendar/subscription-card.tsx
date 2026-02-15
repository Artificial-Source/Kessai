import { memo } from 'react'
import { Check, X, Edit2, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import type { Subscription } from '@/types/subscription'

interface SubscriptionCardProps {
  subscription: Subscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  dueDate: string
  currency?: CurrencyCode
  onMarkPaid: () => void
  onSkip: () => void
  onEdit: () => void
}

export const SubscriptionCard = memo(function SubscriptionCard({
  subscription,
  amount,
  isPaid,
  isSkipped,
  currency = 'USD',
  onMarkPaid,
  onSkip,
  onEdit,
}: SubscriptionCardProps) {
  const isRecorded = isPaid || isSkipped

  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        isRecorded ? 'border-border bg-muted/50' : 'border-border bg-card'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: subscription.color || '#4f8dff' }}
        >
          {subscription.name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-foreground truncate font-medium">{subscription.name}</h4>
            {isPaid && (
              <span className="text-success flex items-center gap-1 text-xs">
                <Check className="h-3 w-3" />
                Paid
              </span>
            )}
            {isSkipped && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <X className="h-3 w-3" />
                Skipped
              </span>
            )}
          </div>
          <p className="text-foreground text-lg font-bold">{formatCurrency(amount, currency)}</p>
        </div>

        {!isRecorded && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={onMarkPaid}
              className="border-success/30 bg-success/15 text-success hover:bg-success/25 border"
            >
              <Check className="mr-1 h-4 w-4" />
              Pay
            </Button>
          </div>
        )}
      </div>
    </div>
  )
})
