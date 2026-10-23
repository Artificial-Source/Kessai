import { memo, useId } from 'react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { cn } from '@/lib/utils'

interface BudgetWidgetProps {
  budget: number
  currentSpend: number
  currency: CurrencyCode
  /** What the spent amount leaves out, e.g. "Excludes 2 in EUR, JPY". */
  note?: string | null
}

const LEVEL_TEXT = {
  ok: 'text-success',
  warning: 'text-warning',
  over: 'text-destructive',
} as const

const LEVEL_BAR = {
  ok: 'bg-success',
  warning: 'bg-warning',
  over: 'bg-destructive',
} as const

export const BudgetWidget = memo(function BudgetWidget({
  budget,
  currentSpend,
  currency,
  note,
}: BudgetWidgetProps) {
  const titleId = useId()
  const percentage = budget > 0 ? (currentSpend / budget) * 100 : 0
  const remaining = budget - currentSpend
  const level = percentage >= 100 ? 'over' : percentage >= 80 ? 'warning' : 'ok'

  return (
    <Card asChild tone={level === 'over' ? 'danger' : 'default'}>
      <section aria-labelledby={titleId}>
        <CardHeader
          action={
            <span
              className={cn(
                'font-[family-name:var(--font-mono)] text-base font-bold tabular-nums',
                LEVEL_TEXT[level]
              )}
            >
              {percentage.toFixed(0)}%
            </span>
          }
        >
          <CardTitle id={titleId}>Monthly budget</CardTitle>
          <CardDescription>Your monthly share against the budget in Settings.</CardDescription>
        </CardHeader>

        <ProgressBar
          value={percentage}
          color={LEVEL_BAR[level]}
          height="md"
          label="Monthly budget used"
          className="mt-4"
        />

        <dl className="mt-4 grid grid-cols-3 gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="type-label text-muted-foreground">Spent</dt>
            <dd className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
              {formatCurrency(currentSpend, currency)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="type-label text-muted-foreground">Budget</dt>
            <dd className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
              {formatCurrency(budget, currency)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="type-label text-muted-foreground">
              {remaining >= 0 ? 'Remaining' : 'Over by'}
            </dt>
            <dd
              className={cn(
                'font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums',
                LEVEL_TEXT[level]
              )}
            >
              {formatCurrency(Math.abs(remaining), currency)}
            </dd>
          </div>
        </dl>
        {note && <p className="text-muted-foreground mt-3 text-xs">{note}</p>}
      </section>
    </Card>
  )
})
