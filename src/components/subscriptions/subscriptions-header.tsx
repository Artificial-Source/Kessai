import React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  BILLED_MONTHLY_LABEL,
  BILLED_YEARLY_LABEL,
  periodTotalLabel,
  periodTotalSuffix,
} from '@/components/subscriptions/subscription-display'
import type { CurrencyCode } from '@/lib/currency'
import type { NormalizationPeriod } from '@/types/subscription'

interface SubscriptionsHeaderProps {
  costNormalization: NormalizationPeriod
  /** Every billable subscription spread over the chosen period (a month when "as billed"). */
  periodTotal: number
  monthlySubsTotal: number
  yearlySubsTotal: number
  currency: CurrencyCode
  /** What the totals leave out, e.g. "Excludes 2 in EUR, JPY". */
  currencyNote: string | null
  /** False while loading or after a failed load: no totals rather than zeros. */
  showTotals: boolean
  openSubscriptionDialog: () => void
}

function Total({ label, value, lead = false }: { label: string; value: string; lead?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'text-foreground font-[family-name:var(--font-mono)] font-bold tabular-nums',
          lead ? 'text-base' : 'text-sm'
        )}
      >
        {value}
      </dd>
    </div>
  )
}

export const SubscriptionsHeader = React.memo(function SubscriptionsHeader({
  costNormalization,
  periodTotal,
  monthlySubsTotal,
  yearlySubsTotal,
  currency,
  currencyNote,
  showTotals,
  openSubscriptionDialog,
}: SubscriptionsHeaderProps) {
  const isNormalized = costNormalization !== 'as-is'

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">My Subscriptions</h1>
          <p className="text-muted-foreground text-sm">
            Totals use your share in {currency}. Other currencies are not converted.
          </p>
        </div>
        <Button variant="glow" onClick={openSubscriptionDialog}>
          <Plus aria-hidden="true" />
          Add Subscription
        </Button>
      </div>

      {showTotals && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
          <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1.5">
            <Total
              lead
              label={periodTotalLabel(costNormalization)}
              value={`${formatCurrency(periodTotal, currency)}${periodTotalSuffix(costNormalization)}`}
            />
            {!isNormalized && monthlySubsTotal > 0 && (
              <Total
                label={BILLED_MONTHLY_LABEL}
                value={`${formatCurrency(monthlySubsTotal, currency)}/mo`}
              />
            )}
            {!isNormalized && yearlySubsTotal > 0 && (
              <Total
                label={BILLED_YEARLY_LABEL}
                value={`${formatCurrency(yearlySubsTotal, currency)}/yr`}
              />
            )}
          </dl>
          {currencyNote && <p className="text-muted-foreground text-xs">{currencyNote}</p>}
        </div>
      )}
    </header>
  )
})
