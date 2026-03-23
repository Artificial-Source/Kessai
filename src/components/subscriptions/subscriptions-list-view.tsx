import { memo } from 'react'
import { Pencil, Trash2, Power, Pin, Ban } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import { formatPaymentDate } from '@/lib/date-utils'
import { BILLING_CYCLE_SHORT, CATEGORY_BADGE_VARIANTS } from '@/lib/constants'
import { calculateNormalizedAmount, NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'
import { Badge } from '@/components/ui/badge'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { TrialBadge } from '@/components/subscriptions/trial-badge'
import { PriceHistoryBadge } from '@/components/subscriptions/price-history-badge'
import type { BadgeVariant } from '@/components/ui/badge'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Tag } from '@/types/tag'
import { TagBadge } from '@/components/tags/tag-badge'

interface SubscriptionsListViewProps {
  subscriptions: Subscription[]
  totalCount: number
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  getCategory: (categoryId: string | null) => Category | undefined
  onEdit: (sub: Subscription) => void
  onDelete: (sub: Subscription) => void
  onCancel: (sub: Subscription) => void
  onToggleActive: (sub: Subscription) => void
  onTogglePinned: (sub: Subscription) => void
  allTags?: Tag[]
  subscriptionTagMap?: Record<string, string[]>
}

function getCategoryVariant(categoryName?: string): BadgeVariant {
  if (!categoryName) return 'secondary'
  return (CATEGORY_BADGE_VARIANTS[categoryName] as BadgeVariant) || 'secondary'
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
  allTags = [],
  subscriptionTagMap = {},
}: SubscriptionsListViewProps) {
  const isNormalized = costNormalization !== 'as-is'
  return (
    <div className="glass-card flex flex-1 flex-col overflow-hidden rounded-xl">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-border border-b bg-[var(--color-subtle-overlay)]">
              <th className="text-muted-foreground px-4 py-3 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                Service
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                Cost
              </th>
              <th className="text-muted-foreground hidden px-4 py-3 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase md:table-cell">
                Next Payment
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                Status
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {subscriptions.map((sub) => {
              const category = getCategory(sub.category_id)
              return (
                <tr
                  key={sub.id}
                  className={`group hover:bg-muted/35 transition-colors ${!sub.is_active ? 'opacity-60' : ''}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <SubscriptionLogo
                        logoUrl={sub.logo_url}
                        name={sub.name}
                        color={sub.color || category?.color}
                        size="md"
                        className="shrink-0 rounded-lg"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-foreground truncate font-medium">{sub.name}</p>
                          {sub.is_pinned && (
                            <Pin className="h-3 w-3 shrink-0 fill-[var(--color-primary)] text-[var(--color-primary)]" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          {category && (
                            <Badge variant={getCategoryVariant(category.name)} size="sm">
                              {category.name}
                            </Badge>
                          )}
                          {(subscriptionTagMap[sub.id] || []).map((tagId) => {
                            const tag = allTags.find((t) => t.id === tagId)
                            return tag ? <TagBadge key={tag.id} tag={tag} /> : null
                          })}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    {(() => {
                      const subCurrency = (sub.currency || currency) as CurrencyCode
                      const isDifferent = subCurrency !== currency
                      const converted = isDifferent
                        ? convertCurrencyCached(sub.amount, subCurrency, currency)
                        : null

                      if (isNormalized) {
                        const baseAmount =
                          isDifferent && converted !== null ? converted : sub.amount
                        const displayCur =
                          isDifferent && converted !== null ? currency : subCurrency
                        const normalizedAmount = calculateNormalizedAmount(
                          baseAmount,
                          sub.billing_cycle,
                          costNormalization
                        )
                        return (
                          <>
                            <div className="flex items-baseline gap-1.5">
                              <p className="text-foreground font-[family-name:var(--font-heading)] font-semibold">
                                {formatCurrency(normalizedAmount, displayCur)}
                              </p>
                              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider">
                                {displayCur}
                              </span>
                            </div>
                            <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                              {NORMALIZATION_SUFFIXES[costNormalization]}
                            </p>
                          </>
                        )
                      }

                      return (
                        <>
                          <div className="flex items-baseline gap-1.5">
                            <p className="text-foreground font-[family-name:var(--font-heading)] font-semibold">
                              {formatCurrency(sub.amount, subCurrency)}
                            </p>
                            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider">
                              {subCurrency}
                            </span>
                          </div>
                          {isDifferent && converted !== null && (
                            <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px]">
                              ≈ {formatCurrency(converted, currency)} {currency}
                            </p>
                          )}
                          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                            {BILLING_CYCLE_SHORT[sub.billing_cycle]}
                          </p>
                        </>
                      )
                    })()}
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                      {sub.next_payment_date ? formatPaymentDate(sub.next_payment_date) : '-'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`h-2 w-2 rounded-full ${
                          sub.is_active ? 'bg-success' : 'bg-warning'
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          sub.is_active ? 'text-success' : 'text-warning'
                        }`}
                      >
                        {sub.is_active ? 'Active' : 'Paused'}
                      </span>
                      {sub.status === 'trial' && (
                        <TrialBadge trialEndDate={sub.trial_end_date ?? null} />
                      )}
                      <PriceHistoryBadge subscriptionId={sub.id} currency={currency} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1 md:opacity-0 md:transition-[opacity] md:group-hover:opacity-100 md:focus-within:opacity-100">
                      <button
                        onClick={() => onTogglePinned(sub)}
                        aria-label={sub.is_pinned ? `Unpin ${sub.name}` : `Pin ${sub.name}`}
                        className={`rounded-lg p-2 transition-colors ${
                          sub.is_pinned
                            ? 'text-[var(--color-primary)] hover:bg-[var(--color-primary)]/15'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        }`}
                      >
                        <Pin className={`h-4 w-4 ${sub.is_pinned ? 'fill-current' : ''}`} />
                      </button>
                      <button
                        onClick={() => onEdit(sub)}
                        aria-label={`Edit ${sub.name}`}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleActive(sub)}
                        aria-label={sub.is_active ? `Pause ${sub.name}` : `Activate ${sub.name}`}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 transition-colors"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onCancel(sub)}
                        aria-label={`Cancel ${sub.name}`}
                        className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-2 transition-colors"
                      >
                        <Ban className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(sub)}
                        aria-label={`Delete ${sub.name}`}
                        className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-2 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="border-border mt-auto border-t bg-[var(--color-subtle-overlay)] px-4 py-3">
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px]" aria-live="polite">
          {subscriptions.length} of {totalCount} subscriptions
        </p>
      </div>
    </div>
  )
})
