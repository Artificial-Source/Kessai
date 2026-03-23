import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { CurrencyCode } from '@/lib/currency'
import type { NormalizationPeriod } from '@/types/subscription'

interface SubscriptionsHeaderProps {
  costNormalization: NormalizationPeriod
  normalizedTotal: number | null
  monthlySubsTotal: number
  yearlySubsTotal: number
  currency: CurrencyCode
  openSubscriptionDialog: () => void
}

export const SubscriptionsHeader = React.memo(function SubscriptionsHeader({
  costNormalization,
  normalizedTotal,
  monthlySubsTotal,
  yearlySubsTotal,
  currency,
  openSubscriptionDialog,
}: SubscriptionsHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">My Subscriptions</h1>
        <div className="flex flex-wrap items-center gap-3">
          {costNormalization !== 'as-is' && normalizedTotal !== null ? (
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                Total:
              </span>
              <span className="bg-primary/10 text-primary rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                {formatCurrency(normalizedTotal, currency)}
                {NORMALIZATION_SUFFIXES[costNormalization]}
              </span>
            </div>
          ) : (
            <>
              {monthlySubsTotal > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                    Monthly:
                  </span>
                  <span className="bg-primary/10 text-primary rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                    {formatCurrency(monthlySubsTotal, currency)}/mo
                  </span>
                </div>
              )}
              {yearlySubsTotal > 0 && (
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                    Yearly:
                  </span>
                  <span className="bg-accent-cyan/10 text-accent-cyan rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                    {formatCurrency(yearlySubsTotal, currency)}/yr
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <Button variant="glow" onClick={openSubscriptionDialog} className="gap-2">
        <Plus className="h-4 w-4" />
        Add Subscription
      </Button>
    </header>
  )
})
