import { memo } from 'react'
import { Pencil, Trash2, Power, Users } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { formatPaymentDate } from '@/lib/date-utils'
import { BILLING_CYCLE_SHORT, CATEGORY_BADGE_VARIANTS } from '@/lib/constants'
import { isBillableStatus } from '@/types/subscription'
import { Badge } from '@/components/ui/badge'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { StatusBadge } from '@/components/subscriptions/status-badge'
import { TrialCountdown } from '@/components/subscriptions/trial-countdown'
import type { BadgeVariant } from '@/components/ui/badge'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'

interface SubscriptionsListViewProps {
  subscriptions: Subscription[]
  totalCount: number
  currency: CurrencyCode
  getCategory: (categoryId: string | null) => Category | undefined
  onEdit: (sub: Subscription) => void
  onDelete: (sub: Subscription) => void
  onToggleActive: (sub: Subscription) => void
}

function getCategoryVariant(categoryName?: string): BadgeVariant {
  if (!categoryName) return 'secondary'
  return (CATEGORY_BADGE_VARIANTS[categoryName] as BadgeVariant) || 'secondary'
}

export const SubscriptionsListView = memo(function SubscriptionsListView({
  subscriptions,
  totalCount,
  currency,
  getCategory,
  onEdit,
  onDelete,
  onToggleActive,
}: SubscriptionsListViewProps) {
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
              const billable = isBillableStatus(sub.status)
              return (
                <tr
                  key={sub.id}
                  className={`group hover:bg-muted/35 transition-colors ${!billable ? 'opacity-60' : ''}`}
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
                        <p className="text-foreground truncate font-medium">{sub.name}</p>
                        <div className="flex items-center gap-2">
                          {category && (
                            <Badge variant={getCategoryVariant(category.name)} size="sm">
                              {category.name}
                            </Badge>
                          )}
                          {sub.shared_count > 1 && (
                            <span className="text-muted-foreground flex items-center gap-0.5 font-[family-name:var(--font-mono)] text-[10px]">
                              <Users className="h-3 w-3" />
                              {sub.shared_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-foreground font-[family-name:var(--font-heading)] font-semibold">
                      {formatCurrency(
                        sub.shared_count > 1 ? sub.amount / sub.shared_count : sub.amount,
                        currency
                      )}
                    </p>
                    <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                      {BILLING_CYCLE_SHORT[sub.billing_cycle]}
                      {sub.shared_count > 1 && (
                        <span className="text-muted-foreground/60">
                          {' '}
                          ({formatCurrency(sub.amount, currency)} total)
                        </span>
                      )}
                    </p>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                      {sub.next_payment_date ? formatPaymentDate(sub.next_payment_date) : '-'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={sub.status} />
                      {sub.status === 'trial' && (
                        <TrialCountdown trialEndDate={sub.trial_end_date} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(sub)}
                        aria-label={`Edit ${sub.name}`}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 focus:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleActive(sub)}
                        aria-label={billable ? `Pause ${sub.name}` : `Activate ${sub.name}`}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 focus:opacity-100"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(sub)}
                        aria-label={`Delete ${sub.name}`}
                        className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100 focus:opacity-100"
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
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px]">
          {subscriptions.length} of {totalCount} subscriptions
        </p>
      </div>
    </div>
  )
})
