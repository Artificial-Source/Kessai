import { TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import { excludedCurrenciesNote } from '@/lib/totals'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { paymentCountLabel } from './day-summary'

/**
 * Above this rise the previous month is under a tenth of this one (a first month, a yearly
 * renewal landing): the percentage says nothing useful, so it is not shown.
 */
const MAX_MEANINGFUL_CHANGE = 900

interface MonthSummaryHeaderProps {
  monthLabel: string
  totalAmount: number
  paidAmount: number
  upcomingAmount: number
  paymentCount: number
  paidCount: number
  skippedCount: number
  excludedCurrencies: Record<string, number>
  comparisonToPrevMonth: number | null
  currency: string
}

function Stat({
  label,
  value,
  meta,
  valueClassName,
  className,
}: {
  label: string
  value: string
  meta: string
  valueClassName?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <dt className="type-label text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight tabular-nums',
          valueClassName ?? 'text-foreground'
        )}
      >
        {value}
      </dd>
      <dd className="text-muted-foreground text-xs">{meta}</dd>
    </div>
  )
}

export function MonthSummaryHeader({
  monthLabel,
  totalAmount,
  paidAmount,
  upcomingAmount,
  paymentCount,
  paidCount,
  skippedCount,
  excludedCurrencies,
  comparisonToPrevMonth,
  currency,
}: MonthSummaryHeaderProps) {
  const upcomingCount = paymentCount - paidCount - skippedCount
  const change = comparisonToPrevMonth === null ? 0 : Math.round(comparisonToPrevMonth)
  const showChange =
    comparisonToPrevMonth !== null && change !== 0 && change <= MAX_MEANINGFUL_CHANGE
  const exclusionNote = excludedCurrenciesNote(excludedCurrencies)

  return (
    <Card asChild>
      <section
        aria-label={`${monthLabel} totals`}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:gap-x-10">
          <Stat
            label="Total"
            value={formatCurrency(totalAmount, currency)}
            meta={paymentCountLabel(paymentCount)}
            className="col-span-2"
          />
          <Stat
            label="Paid"
            value={formatCurrency(paidAmount, currency)}
            meta={
              skippedCount > 0
                ? `${paymentCountLabel(paidCount)} · ${skippedCount} skipped`
                : paymentCountLabel(paidCount)
            }
            valueClassName={paidAmount > 0 ? 'text-success' : undefined}
          />
          <Stat
            label="Upcoming"
            value={formatCurrency(upcomingAmount, currency)}
            meta={paymentCountLabel(upcomingCount)}
          />
        </dl>

        {showChange || exclusionNote ? (
          <div className="flex flex-col items-start gap-2 sm:items-end sm:text-right">
            {showChange ? (
              <Badge variant="secondary">
                {change > 0 ? (
                  <TrendingUp className="size-3" aria-hidden="true" />
                ) : (
                  <TrendingDown className="size-3" aria-hidden="true" />
                )}
                {change > 0 ? '+' : '−'}
                {Math.abs(change)}% vs last month
              </Badge>
            ) : null}
            {exclusionNote ? (
              <p className="text-muted-foreground text-xs">{exclusionNote}</p>
            ) : null}
          </div>
        ) : null}
      </section>
    </Card>
  )
}

/** Same footprint as the live summary while the month loads. */
export function MonthSummarySkeleton() {
  return (
    <Card className="grid grid-cols-2 gap-x-6 gap-y-5 sm:flex sm:gap-x-10" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn('flex flex-col gap-1.5', i === 0 && 'col-span-2')}>
          <Skeleton className="h-3 w-14" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </Card>
  )
}
