import React, { useState } from 'react'
import dayjs from 'dayjs'
import { ChevronDown, Ban, Trash2 } from 'lucide-react'
import { formatCurrency } from '@/lib/currency'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'

interface CancelledSubscriptionsSectionProps {
  cancelledSubscriptions: Subscription[]
  getCategory: (id: string | null) => Category | undefined
  currency: CurrencyCode
  setDeleteTarget: (sub: Subscription) => void
}

export const CancelledSubscriptionsSection = React.memo(function CancelledSubscriptionsSection({
  cancelledSubscriptions,
  getCategory,
  currency,
  setDeleteTarget,
}: CancelledSubscriptionsSectionProps) {
  const [showCancelled, setShowCancelled] = useState(false)

  if (cancelledSubscriptions.length === 0) return null

  return (
    <div className="mt-2">
      <button
        onClick={() => setShowCancelled((prev) => !prev)}
        className="text-muted-foreground hover:text-foreground flex items-center gap-2 py-2 transition-colors"
      >
        <ChevronDown
          className={`h-4 w-4 transition-transform ${showCancelled ? 'rotate-0' : '-rotate-90'}`}
        />
        <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
          Cancelled ({cancelledSubscriptions.length})
        </span>
      </button>
      {showCancelled && (
        <div className="animate-fade-in-up mt-2 space-y-2">
          {cancelledSubscriptions.map((sub) => {
            const category = getCategory(sub.category_id)
            return (
              <div
                key={sub.id}
                className="glass-card flex items-center justify-between gap-4 rounded-xl px-4 py-3 opacity-60"
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <Ban className="text-destructive h-4 w-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-foreground truncate text-sm font-medium">{sub.name}</p>
                    <div className="text-muted-foreground flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px]">
                      {sub.cancelled_at && (
                        <span>Cancelled {dayjs(sub.cancelled_at).format('MMM D, YYYY')}</span>
                      )}
                      {sub.cancellation_reason && (
                        <>
                          <span className="text-border">|</span>
                          <span className="truncate" title={sub.cancellation_reason}>
                            {sub.cancellation_reason}
                          </span>
                        </>
                      )}
                      {category && (
                        <>
                          <span className="text-border">|</span>
                          <span>{category.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                    {formatCurrency(sub.amount, (sub.currency || currency) as CurrencyCode)}
                  </span>
                  <button
                    onClick={() => setDeleteTarget(sub)}
                    aria-label={`Delete ${sub.name}`}
                    className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-1.5 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
