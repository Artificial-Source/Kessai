import { memo } from 'react'
import { CheckCircle2, Pin } from 'lucide-react'
import { formatAmount } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { calculateNormalizedAmount, NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { StatusBadge } from '@/components/subscriptions/status-badge'
import {
  formatRowDate,
  subscriptionDisplayStatus,
} from '@/components/subscriptions/subscription-display'
import {
  SubscriptionActions,
  type SubscriptionRowActions,
} from '@/components/subscriptions/subscriptions-list-view'
import { TrialBadge } from '@/components/subscriptions/trial-badge'
import { TagBadge } from '@/components/tags/tag-badge'
import { subscriptionFocusProps } from '@/lib/focus'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Tag } from '@/types/tag'

interface SubscriptionsGridViewProps extends SubscriptionRowActions {
  subscriptions: Subscription[]
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  getCategory: (categoryId: string | null) => Category | undefined
  tagById?: Record<string, Tag>
  subscriptionTagMap?: Record<string, string[]>
}

export const SubscriptionsGridView = memo(function SubscriptionsGridView({
  subscriptions,
  currency,
  costNormalization,
  getCategory,
  onEdit,
  onDelete,
  onCancel,
  onToggleActive,
  onMarkAsPaid,
  canMarkAsPaid,
  onTogglePinned,
  tagById = {},
  subscriptionTagMap = {},
}: SubscriptionsGridViewProps) {
  const isNormalized = costNormalization !== 'as-is'

  return (
    <ul className="stagger-children grid gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
      {subscriptions.map((sub) => {
        const category = getCategory(sub.category_id)
        const tags = (subscriptionTagMap[sub.id] || []).flatMap((tagId) =>
          tagById[tagId] ? [tagById[tagId]] : []
        )
        const subCurrency = (sub.currency || currency) as CurrencyCode
        const amount = isNormalized
          ? calculateNormalizedAmount(sub.amount, sub.billing_cycle, costNormalization)
          : sub.amount
        const period = isNormalized
          ? NORMALIZATION_SUFFIXES[costNormalization]
          : BILLING_CYCLE_SHORT[sub.billing_cycle]

        return (
          <li key={sub.id} className="flex min-w-0">
            <Card padding="none" className="flex w-full min-w-0 flex-col">
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <SubscriptionLogo
                    logoUrl={sub.logo_url}
                    name={sub.name}
                    color={sub.color || category?.color}
                    size="lg"
                    decorative
                    dimmed={!sub.is_active}
                    className="shrink-0 rounded-xl"
                  />
                  {sub.status === 'trial' && sub.is_active ? (
                    <TrialBadge trialEndDate={sub.trial_end_date ?? null} />
                  ) : (
                    <StatusBadge status={subscriptionDisplayStatus(sub)} />
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-2">
                  <h2 className="flex min-w-0 items-center gap-1.5 text-lg leading-tight font-bold tracking-tight">
                    <span
                      {...subscriptionFocusProps(sub.id)}
                      className="truncate rounded-sm focus-visible:outline-offset-1"
                      title={sub.name}
                    >
                      {sub.name}
                    </span>
                    {sub.is_pinned && (
                      <>
                        <Pin aria-hidden="true" className="size-3.5 shrink-0 fill-current" />
                        <span className="sr-only">(pinned)</span>
                      </>
                    )}
                  </h2>
                  {(category || tags.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {category && (
                        <Badge variant="secondary" size="sm" dot dotColor={category.color}>
                          {category.name}
                        </Badge>
                      )}
                      {tags.map((tag) => (
                        <TagBadge key={tag.id} tag={tag} />
                      ))}
                    </div>
                  )}
                </div>

                <p className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-foreground font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight tabular-nums">
                    {formatAmount(amount, subCurrency)}
                  </span>
                  {amount !== 0 && (
                    <span className="type-label text-muted-foreground">
                      {subCurrency}
                      {period}
                    </span>
                  )}
                </p>
              </div>

              {/* Fixed action row: nothing appears or hides on hover. */}
              <div className="border-border flex min-h-14 items-center gap-2 border-t px-3 py-2">
                {canMarkAsPaid(sub) ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onMarkAsPaid(sub)}
                    aria-label={`Mark paid for ${sub.name}`}
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Mark paid
                  </Button>
                ) : (
                  <p className="text-muted-foreground px-2 text-xs">
                    {sub.next_payment_date
                      ? `Next ${formatRowDate(sub.next_payment_date)}`
                      : 'No payment date'}
                  </p>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <SubscriptionActions
                    subscription={sub}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onCancel={onCancel}
                    onToggleActive={onToggleActive}
                    onTogglePinned={onTogglePinned}
                    editClassName=""
                  />
                </div>
              </div>
            </Card>
          </li>
        )
      })}
    </ul>
  )
})
