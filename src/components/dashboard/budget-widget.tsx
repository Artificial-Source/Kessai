import { memo, useMemo } from 'react'
import { Wallet } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

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
    level === 'over' ? 'bg-red-500' : level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'

  const textColor =
    level === 'over' ? 'text-red-400' : level === 'warning' ? 'text-amber-400' : 'text-emerald-400'

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
      <div className="relative mb-4 h-2.5 overflow-hidden rounded-full bg-[var(--color-subtle-overlay)]">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
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
