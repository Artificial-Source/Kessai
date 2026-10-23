import { memo } from 'react'
import { Ban, CheckCircle2, Pencil, Pause, Pin, PinOff, Play, Trash2 } from 'lucide-react'
import { formatAmount } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { calculateNormalizedAmount, NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'
import { ActionMenu } from '@/components/ui/action-menu'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/subscriptions/status-badge'
import {
  formatRowDate,
  subscriptionDisplayStatus,
} from '@/components/subscriptions/subscription-display'
import { SubscriptionRow, SubscriptionRowHeader } from '@/components/subscriptions/subscription-row'
import { TrialBadge } from '@/components/subscriptions/trial-badge'
import { TagBadge } from '@/components/tags/tag-badge'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Tag } from '@/types/tag'

export interface SubscriptionRowActions {
  onEdit: (sub: Subscription) => void
  onDelete: (sub: Subscription) => void
  onCancel: (sub: Subscription) => void
  onToggleActive: (sub: Subscription) => void
  onTogglePinned: (sub: Subscription) => void
  onMarkAsPaid: (sub: Subscription) => void
  canMarkAsPaid: (sub: Subscription) => boolean
}

interface SubscriptionsListViewProps extends SubscriptionRowActions {
  subscriptions: Subscription[]
  totalCount: number
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  getCategory: (categoryId: string | null) => Category | undefined
  tagById?: Record<string, Tag>
  subscriptionTagMap?: Record<string, string[]>
}

/** Amount, its currency, and the period it covers, as one data cell. */
export function SubscriptionCost({
  subscription,
  currency,
  costNormalization,
}: {
  subscription: Subscription
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
}) {
  const subCurrency = (subscription.currency || currency) as CurrencyCode
  const isNormalized = costNormalization !== 'as-is'
  const amount = isNormalized
    ? calculateNormalizedAmount(subscription.amount, subscription.billing_cycle, costNormalization)
    : subscription.amount
  const period = isNormalized
    ? NORMALIZATION_SUFFIXES[costNormalization]
    : BILLING_CYCLE_SHORT[subscription.billing_cycle]

  return (
    <span className="inline-flex items-baseline gap-1.5 lg:flex lg:flex-col lg:items-start lg:gap-0.5">
      <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
        {formatAmount(amount, subCurrency)}
      </span>
      {amount !== 0 && (
        <span className="type-label text-muted-foreground">
          {subCurrency}
          {period}
        </span>
      )}
    </span>
  )
}

export const SubscriptionsListView = memo(function SubscriptionsListView({
  subscriptions,
  totalCount,
  currency,
  costNormalization,
  getCategory,
  onEdit,
  onDelete,
  onCancel,
  onToggleActive,
  onTogglePinned,
  onMarkAsPaid,
  canMarkAsPaid,
  tagById = {},
  subscriptionTagMap = {},
}: SubscriptionsListViewProps) {
  return (
    <Card padding="none" className="flex flex-col overflow-hidden">
      <SubscriptionRowHeader dateLabel="Next payment" />
      <ul className="divide-border divide-y">
        {subscriptions.map((sub) => {
          const category = getCategory(sub.category_id)
          const tags = (subscriptionTagMap[sub.id] || []).flatMap((tagId) =>
            tagById[tagId] ? [tagById[tagId]] : []
          )
          return (
            <SubscriptionRow
              key={sub.id}
              subscription={sub}
              logoColor={category?.color}
              details={
                category || tags.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1">
                    {category && (
                      <Badge variant="secondary" size="sm" dot dotColor={category.color}>
                        {category.name}
                      </Badge>
                    )}
                    {tags.map((tag) => (
                      <TagBadge key={tag.id} tag={tag} />
                    ))}
                  </div>
                ) : null
              }
              cost={
                <SubscriptionCost
                  subscription={sub}
                  currency={currency}
                  costNormalization={costNormalization}
                />
              }
              datePrefix="Next"
              date={sub.next_payment_date ? formatRowDate(sub.next_payment_date) : 'Not set'}
              status={
                sub.status === 'trial' && sub.is_active ? (
                  <TrialBadge trialEndDate={sub.trial_end_date ?? null} />
                ) : (
                  <StatusBadge status={subscriptionDisplayStatus(sub)} />
                )
              }
              primaryAction={
                canMarkAsPaid(sub) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onMarkAsPaid(sub)}
                    aria-label={`Mark paid for ${sub.name}`}
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Mark paid
                  </Button>
                ) : null
              }
              actions={
                <SubscriptionActions
                  subscription={sub}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onCancel={onCancel}
                  onToggleActive={onToggleActive}
                  onTogglePinned={onTogglePinned}
                />
              }
            />
          )
        })}
      </ul>
      <p
        className="type-label text-muted-foreground border-border mt-auto border-t bg-[var(--color-subtle-overlay)] px-4 py-3"
        aria-live="polite"
      >
        {subscriptions.length} of {totalCount} subscriptions
      </p>
    </Card>
  )
})

/** Edit stays visible; pin, pause, cancel, and delete live behind one named "More" button. */
export function SubscriptionActions({
  subscription: sub,
  onEdit,
  onDelete,
  onCancel,
  onToggleActive,
  onTogglePinned,
  editClassName = 'hidden sm:inline-flex',
}: Pick<
  SubscriptionRowActions,
  'onEdit' | 'onDelete' | 'onCancel' | 'onToggleActive' | 'onTogglePinned'
> & {
  subscription: Subscription
  /** Where the standalone Edit button shows; the menu always offers Edit too. */
  editClassName?: string
}) {
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Edit ${sub.name}`}
        onClick={() => onEdit(sub)}
        className={cn('text-muted-foreground hover:text-foreground', editClassName)}
      >
        <Pencil aria-hidden="true" />
      </Button>
      <ActionMenu
        label={`More actions for ${sub.name}`}
        items={[
          { label: 'Edit', icon: Pencil, onSelect: () => onEdit(sub) },
          sub.is_pinned
            ? { label: 'Unpin', icon: PinOff, onSelect: () => onTogglePinned(sub) }
            : { label: 'Pin to top', icon: Pin, onSelect: () => onTogglePinned(sub) },
          sub.is_active
            ? { label: 'Pause', icon: Pause, onSelect: () => onToggleActive(sub) }
            : { label: 'Resume', icon: Play, onSelect: () => onToggleActive(sub) },
          {
            label: 'Cancel subscription',
            icon: Ban,
            tone: 'danger',
            onSelect: () => onCancel(sub),
          },
          {
            label: 'Delete',
            icon: Trash2,
            tone: 'danger',
            onSelect: () => onDelete(sub),
          },
        ]}
      />
    </>
  )
}
