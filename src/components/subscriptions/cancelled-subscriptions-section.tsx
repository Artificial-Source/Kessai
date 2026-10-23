import React, { useId, useState } from 'react'
import { ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/subscriptions/status-badge'
import { formatRowDate } from '@/components/subscriptions/subscription-display'
import { SubscriptionRow, SubscriptionRowHeader } from '@/components/subscriptions/subscription-row'
import { SubscriptionCost } from '@/components/subscriptions/subscriptions-list-view'
import { cn } from '@/lib/utils'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'

interface CancelledSubscriptionsSectionProps {
  cancelledSubscriptions: Subscription[]
  getCategory: (id: string | null) => Category | undefined
  currency: CurrencyCode
  setDeleteTarget: (sub: Subscription) => void
  /** Moves a cancelled subscription back to active. */
  onReactivate: (sub: Subscription) => void
  /** Opens the list when it holds the only matches for the current search or filters. */
  autoExpand?: boolean
}

export const CancelledSubscriptionsSection = React.memo(function CancelledSubscriptionsSection({
  cancelledSubscriptions,
  getCategory,
  currency,
  setDeleteTarget,
  onReactivate,
  autoExpand = false,
}: CancelledSubscriptionsSectionProps) {
  const [showCancelled, setShowCancelled] = useState(autoExpand)
  // Opening follows the matches as they appear; closing stays the user's call.
  const [wasAutoExpanded, setWasAutoExpanded] = useState(autoExpand)
  if (autoExpand !== wasAutoExpanded) {
    setWasAutoExpanded(autoExpand)
    if (autoExpand) setShowCancelled(true)
  }
  const listId = useId()

  if (cancelledSubscriptions.length === 0) return null

  return (
    <section aria-label="Cancelled subscriptions" className="flex flex-col gap-3">
      <Button
        variant="ghost"
        aria-expanded={showCancelled}
        aria-controls={listId}
        onClick={() => setShowCancelled((prev) => !prev)}
        className="text-muted-foreground hover:text-foreground -ml-2 self-start px-2"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn('transition-transform duration-150', !showCancelled && '-rotate-90')}
        />
        Cancelled subscriptions
        <Badge variant="secondary" size="sm">
          {cancelledSubscriptions.length}
        </Badge>
      </Button>

      {showCancelled && (
        <Card id={listId} padding="none" className="animate-fade-in-up overflow-hidden">
          <SubscriptionRowHeader dateLabel="Cancelled on" />
          <ul className="divide-border divide-y">
            {cancelledSubscriptions.map((sub) => {
              const category = getCategory(sub.category_id)
              return (
                <SubscriptionRow
                  key={sub.id}
                  subscription={sub}
                  logoColor={category?.color}
                  details={
                    sub.cancellation_reason || category ? (
                      <p className="text-muted-foreground truncate text-xs">
                        {[
                          category?.name,
                          sub.cancellation_reason && `Reason: ${sub.cancellation_reason}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    ) : null
                  }
                  cost={
                    <SubscriptionCost
                      subscription={sub}
                      currency={currency}
                      costNormalization="as-is"
                    />
                  }
                  datePrefix="Cancelled"
                  date={sub.cancelled_at ? formatRowDate(sub.cancelled_at) : '—'}
                  status={<StatusBadge status="cancelled" />}
                  primaryAction={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onReactivate(sub)}
                      aria-label={`Reactivate ${sub.name}`}
                    >
                      <RotateCcw aria-hidden="true" />
                      Reactivate
                    </Button>
                  }
                  actions={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${sub.name}`}
                      onClick={() => setDeleteTarget(sub)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  }
                />
              )
            })}
          </ul>
        </Card>
      )}
    </section>
  )
})
