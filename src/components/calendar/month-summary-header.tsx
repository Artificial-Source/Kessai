import { TrendingUp, TrendingDown, CheckCircle2, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

interface MonthSummaryHeaderProps {
  totalAmount: number
  paidAmount: number
  upcomingAmount: number
  paymentCount: number
  paidCount: number
  comparisonToPrevMonth: number
  currency?: CurrencyCode
}

export function MonthSummaryHeader({
  totalAmount,
  paidAmount,
  upcomingAmount,
  paymentCount,
  paidCount,
  comparisonToPrevMonth,
  currency = 'USD',
}: MonthSummaryHeaderProps) {
  const upcomingCount = paymentCount - paidCount
  const isUp = comparisonToPrevMonth > 0
  const isDown = comparisonToPrevMonth < 0

  return (
    <div className="glass-card p-5">
      <div className="flex flex-wrap items-center gap-6 md:gap-0">
        <div className="flex flex-col">
          <span className="text-muted-foreground mb-1 flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
            Total
            {(isUp || isDown) && (
              <span
                className={cn(
                  'flex items-center gap-1',
                  isUp ? 'text-rose-400' : 'text-emerald-400'
                )}
              >
                {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(comparisonToPrevMonth).toFixed(0)}%
              </span>
            )}
          </span>
          <span className="text-foreground font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight">
            {formatCurrency(totalAmount, currency)}
          </span>
          <span className="text-muted-foreground mt-1 font-[family-name:var(--font-mono)] text-[10px]">
            {paymentCount} payment{paymentCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="bg-border mx-6 hidden h-12 w-px md:block" />

        <div className="flex flex-col">
          <span className="mb-1 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest text-emerald-500 uppercase">
            <CheckCircle2 className="h-3 w-3" /> Paid ({paidCount})
          </span>
          <span className="font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight text-emerald-500">
            {formatCurrency(paidAmount, currency)}
          </span>
          <span className="text-muted-foreground mt-1 font-[family-name:var(--font-mono)] text-[10px]">
            {paidCount} payment{paidCount !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="bg-border mx-6 hidden h-12 w-px md:block" />

        <div className="flex flex-col">
          <span className="text-primary mb-1 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
            <Clock className="h-3 w-3" /> Upcoming ({upcomingCount})
          </span>
          <span className="text-primary font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight">
            {formatCurrency(upcomingAmount, currency)}
          </span>
          <span className="text-muted-foreground mt-1 font-[family-name:var(--font-mono)] text-[10px]">
            {upcomingCount} payment{upcomingCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
