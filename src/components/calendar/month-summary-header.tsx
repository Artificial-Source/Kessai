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
    <div className="glass-card group relative overflow-hidden rounded-xl p-0.5">
      <div className="from-primary/5 to-primary/5 absolute inset-0 bg-gradient-to-r via-transparent opacity-0 group-hover:opacity-100" />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-8 p-5">
        <div className="divide-border flex flex-wrap items-center gap-8 md:gap-12 md:divide-x">
          <div className="flex flex-col first:pl-0">
            <span className="text-muted-foreground mb-1 flex items-center gap-2 text-xs font-semibold tracking-wider uppercase">
              Monthly Total
              {(isUp || isDown) && (
                <span
                  className={cn('flex items-center gap-1', isUp ? 'text-danger' : 'text-success')}
                >
                  {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(comparisonToPrevMonth).toFixed(0)}%
                </span>
              )}
            </span>
            <span className="text-foreground text-2xl font-bold tracking-tight">
              {formatCurrency(totalAmount, currency)}
            </span>
          </div>

          <div className="flex flex-col md:pl-12">
            <span className="text-success mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
              <CheckCircle2 className="h-4 w-4" /> Paid ({paidCount})
            </span>
            <span className="text-success text-2xl font-bold tracking-tight">
              {formatCurrency(paidAmount, currency)}
            </span>
          </div>

          <div className="flex flex-col md:pl-12">
            <span className="text-primary mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
              <Clock className="h-4 w-4" /> Upcoming ({upcomingCount})
            </span>
            <span className="text-primary text-2xl font-bold tracking-tight">
              {formatCurrency(upcomingAmount, currency)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
