import { memo } from 'react'
import { Pencil, Trash2, Power, Pin, Ban } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import { BILLING_CYCLE_LABELS, CATEGORY_BADGE_VARIANTS } from '@/lib/constants'
import {
  calculateNormalizedAmount,
  NORMALIZATION_LABELS,
  NORMALIZATION_SUFFIXES,
} from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { TrialBadge } from '@/components/subscriptions/trial-badge'
import type { BadgeVariant } from '@/components/ui/badge'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Tag } from '@/types/tag'
import { TagBadge } from '@/components/tags/tag-badge'

interface SubscriptionsGridViewProps {
  subscriptions: Subscription[]
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  getCategory: (categoryId: string | null) => Category | undefined
  onEdit: (sub: Subscription) => void
  onDelete: (sub: Subscription) => void
  onCancel: (sub: Subscription) => void
  onToggleActive: (sub: Subscription) => void
  onMarkAsPaid: (sub: Subscription) => void
  canMarkAsPaid: (sub: Subscription) => boolean
  onTogglePinned: (sub: Subscription) => void
  tagById?: Record<string, Tag>
  subscriptionTagMap?: Record<string, string[]>
}

function getCategoryVariant(categoryName?: string): BadgeVariant {
  if (!categoryName) return 'secondary'
  return (CATEGORY_BADGE_VARIANTS[categoryName] as BadgeVariant) || 'secondary'
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
    <div className="stagger-children grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
      {subscriptions.map((sub) => {
        const category = getCategory(sub.category_id)
        return (
          <div
            key={sub.id}
            className={`glass-card hover-lift group relative ${!sub.is_active ? 'opacity-60' : ''}`}
          >
            {sub.is_pinned && (
              <div className="absolute top-2 left-2 z-10">
                <Pin className="h-3.5 w-3.5 fill-[var(--color-primary)] text-[var(--color-primary)]" />
              </div>
            )}
            <div className="absolute top-3 right-3 z-20 flex gap-1 rounded-lg bg-[var(--color-surface-elevated)] p-1 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <button
                onClick={() => onTogglePinned(sub)}
                aria-label={sub.is_pinned ? `Unpin ${sub.name}` : `Pin ${sub.name}`}
                className={`rounded-md p-1.5 ${
                  sub.is_pinned
                    ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${sub.is_pinned ? 'fill-current' : ''}`} />
              </button>
              <button
                onClick={() => onEdit(sub)}
                aria-label={`Edit ${sub.name}`}
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onToggleActive(sub)}
                aria-label={sub.is_active ? `Pause ${sub.name}` : `Activate ${sub.name}`}
                className="text-muted-foreground hover:bg-muted hover:text-foreground rounded-md p-1.5"
              >
                <Power className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onCancel(sub)}
                aria-label={`Cancel ${sub.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5"
              >
                <Ban className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onDelete(sub)}
                aria-label={`Delete ${sub.name}`}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-md p-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 p-6">
              <div className="flex items-start justify-between gap-4">
                <SubscriptionLogo
                  logoUrl={sub.logo_url}
                  name={sub.name}
                  color={sub.color || category?.color}
                  size="lg"
                  className="shrink-0 rounded-xl"
                />
                {category && (
                  <Badge
                    variant={getCategoryVariant(category.name)}
                    size="sm"
                    className="mt-1 shrink-0 transition-opacity group-hover:opacity-0 focus-within:opacity-0"
                  >
                    {category.name}
                  </Badge>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <h3
                  className="text-foreground max-w-full truncate font-[family-name:var(--font-heading)] text-xl font-bold"
                  title={sub.name}
                >
                  {sub.name}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                    {isNormalized
                      ? NORMALIZATION_LABELS[costNormalization]
                      : BILLING_CYCLE_LABELS[sub.billing_cycle]}
                  </p>
                  {sub.status === 'trial' && (
                    <TrialBadge trialEndDate={sub.trial_end_date ?? null} />
                  )}
                </div>
                {(subscriptionTagMap[sub.id] || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(subscriptionTagMap[sub.id] || []).map((tagId) => {
                      const tag = tagById[tagId]
                      return tag ? <TagBadge key={tag.id} tag={tag} /> : null
                    })}
                  </div>
                )}
              </div>

              <div className="mt-auto flex items-end justify-between">
                <div className="flex flex-col gap-0.5">
                  {(() => {
                    const subCurrency = (sub.currency || currency) as CurrencyCode
                    const isDifferent = subCurrency !== currency
                    const converted = isDifferent
                      ? convertCurrencyCached(sub.amount, subCurrency, currency)
                      : null

                    if (isNormalized) {
                      const baseAmount = isDifferent && converted !== null ? converted : sub.amount
                      const displayCur = isDifferent && converted !== null ? currency : subCurrency
                      const normalizedAmount = calculateNormalizedAmount(
                        baseAmount,
                        sub.billing_cycle,
                        costNormalization
                      )
                      return (
                        <div className="flex items-baseline gap-1">
                          <p className="text-foreground font-[family-name:var(--font-heading)] text-[28px] leading-none font-bold">
                            {formatCurrency(normalizedAmount, displayCur)}
                          </p>
                          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                            {displayCur.toUpperCase()}
                            <span className="ml-0.5">
                              {NORMALIZATION_SUFFIXES[costNormalization]}
                            </span>
                          </span>
                        </div>
                      )
                    }

                    return (
                      <>
                        <div className="flex items-baseline gap-1">
                          <p className="text-foreground font-[family-name:var(--font-heading)] text-[28px] leading-none font-bold">
                            {formatCurrency(sub.amount, subCurrency)}
                          </p>
                          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                            {subCurrency.toUpperCase()}
                            <span className="ml-0.5">
                              /{sub.billing_cycle === 'yearly' ? 'yr' : 'mo'}
                            </span>
                          </span>
                        </div>
                        {isDifferent && converted !== null && (
                          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px]">
                            ≈ {formatCurrency(converted, currency)} {currency}
                          </p>
                        )}
                      </>
                    )
                  })()}
                </div>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      sub.is_active ? 'bg-success' : 'bg-warning'
                    }`}
                  />
                  <span
                    className={`font-[family-name:var(--font-mono)] text-[10px] font-medium ${
                      sub.is_active ? 'text-success' : 'text-warning'
                    }`}
                  >
                    {sub.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>

              {canMarkAsPaid(sub) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onMarkAsPaid(sub)}
                  className="border-success/30 bg-success/10 text-success hover:bg-success/20 w-full"
                >
                  Mark as Paid
                </Button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
})
