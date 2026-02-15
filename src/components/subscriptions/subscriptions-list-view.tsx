import { memo } from 'react'
import { Pencil, Trash2, Power } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import { formatPaymentDate } from '@/lib/date-utils'
import { BILLING_CYCLE_SHORT, CATEGORY_BADGE_VARIANTS } from '@/lib/constants'
import { Badge } from '@/components/ui/badge'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
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
            <tr className="border-border bg-muted/30 border-b">
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">
                Service
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">
                Cost
              </th>
              <th className="text-muted-foreground hidden px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase md:table-cell">
                Next Payment
              </th>
              <th className="text-muted-foreground px-4 py-3 text-left text-xs font-semibold tracking-wider uppercase">
                Status
              </th>
              <th className="text-muted-foreground px-4 py-3 text-right text-xs font-semibold tracking-wider uppercase">
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
                        <p className="text-foreground truncate font-medium">{sub.name}</p>
                        {category && (
                          <Badge variant={getCategoryVariant(category.name)} size="sm">
                            {category.name}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-foreground font-semibold">
                      {formatCurrency(sub.amount, currency)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {BILLING_CYCLE_SHORT[sub.billing_cycle]}
                    </p>
                  </td>
                  <td className="hidden px-4 py-4 md:table-cell">
                    <p className="text-muted-foreground text-sm">
                      {sub.next_payment_date ? formatPaymentDate(sub.next_payment_date) : '-'}
                    </p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
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
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onEdit(sub)}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleActive(sub)}
                        className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(sub)}
                        className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-2 opacity-0 transition-[opacity,background-color,color] group-hover:opacity-100"
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
      <div className="border-border bg-muted/30 mt-auto border-t px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {subscriptions.length} of {totalCount} subscriptions
        </p>
      </div>
    </div>
  )
})
