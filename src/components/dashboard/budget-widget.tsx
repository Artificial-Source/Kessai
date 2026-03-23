import { memo, useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { ProgressBar } from '@/components/ui/progress-bar'

interface BudgetWidgetProps {
  budget: number
  currentSpend: number
  currency: CurrencyCode
}

export const BudgetWidget = memo(function BudgetWidget({
  budget,
  currentSpend,
  currency,
}: BudgetWidgetProps) {
  const { percentage, remaining, level } = useMemo(() => {
    const pct = budget > 0 ? (currentSpend / budget) * 100 : 0
    const rem = budget - currentSpend
    const lvl = pct >= 100 ? 'over' : pct >= 80 ? 'warning' : 'ok'
    return {
      percentage: Math.min(pct, 100),
      remaining: rem,
      level: lvl as 'ok' | 'warning' | 'over',
    }
  }, [budget, currentSpend])

  const barColor =
    level === 'over' ? 'bg-destructive' : level === 'warning' ? 'bg-warning' : 'bg-success'

  const textColor =
    level === 'over' ? 'text-destructive' : level === 'warning' ? 'text-warning' : 'text-success'

  return (
    <div className="glass-card w-full p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
            <Wallet className="h-4 w-4" />
          </div>
          <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
            Monthly Budget
          </h3>
        </div>
        <span className={`font-[family-name:var(--font-mono)] text-sm font-bold ${textColor}`}>
          {percentage.toFixed(0)}%
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar
        value={percentage}
        color={barColor}
        height="md"
        rounded="full"
        className="mb-4"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="text-muted-foreground mb-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            Spent
          </p>
          <p className="text-foreground font-[family-name:var(--font-heading)] text-sm font-bold">
            {formatCurrency(currentSpend, currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            Budget
          </p>
          <p className="text-foreground font-[family-name:var(--font-heading)] text-sm font-bold">
            {formatCurrency(budget, currency)}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground mb-0.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            {remaining >= 0 ? 'Remaining' : 'Over by'}
          </p>
          <p className={`font-[family-name:var(--font-heading)] text-sm font-bold ${textColor}`}>
            {formatCurrency(Math.abs(remaining), currency)}
          </p>
        </div>
      </div>
    </div>
  )
})
