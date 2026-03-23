import { useState, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import dayjs from 'dayjs'
import { useSettingsStore } from '@/stores/settings-store'
import { useAnalytics } from '@/hooks/use-analytics'
import { SpendingVelocityCard } from '@/components/analytics/spending-velocity-card'
import { MonthlySpendingChart } from '@/components/analytics/monthly-spending-chart'
import { YearSummaryCard } from '@/components/analytics/year-summary-card'
import { CategoryBreakdownChart } from '@/components/analytics/category-breakdown-chart'
import { AnalyticsSkeleton } from '@/components/analytics/analytics-skeleton'
import { AlertTriangle } from 'lucide-react'
import type { CurrencyCode } from '@/lib/currency'

type MonthsOption = 6 | 12

export function AnalyticsPage() {
  const currentYear = useMemo(() => dayjs().year(), [])
  const [year, setYear] = useState(currentYear)
  const [months, setMonths] = useState<MonthsOption>(12)

  const { settings } = useSettingsStore(
    useShallow((state) => ({
      settings: state.settings,
    }))
  )
  const currency = (settings?.currency || 'USD') as CurrencyCode

  const { monthlySpending, yearSummary, velocity, categorySpending, isLoading, error } =
    useAnalytics(year, months)

  if (isLoading) {
    return <AnalyticsSkeleton />
  }

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Spending Analytics</h2>
          <p className="text-muted-foreground text-sm">
            Insights from your recorded payment history
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Year selector */}
          <div className="border-border flex overflow-hidden rounded-none border">
            {[currentYear - 1, currentYear].map((y, idx) => (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`min-w-[56px] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors ${
                  year === y
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground bg-transparent'
                } ${idx > 0 ? 'border-border border-l' : ''}`}
              >
                {y}
              </button>
            ))}
          </div>

          {/* Month range selector */}
          <div className="border-border flex overflow-hidden rounded-none border">
            {([6, 12] as MonthsOption[]).map((m, idx) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`min-w-[40px] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors ${
                  months === m
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:text-foreground bg-transparent'
                } ${idx > 0 ? 'border-border border-l' : ''}`}
              >
                {m}M
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Partial failure banner */}
      {error && (
        <div className="glass-card flex items-center gap-3 border-amber-500/20 bg-amber-500/5 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-muted-foreground text-sm">
            Some analytics data could not be loaded. Showing available data.
          </p>
        </div>
      )}

      {/* Spending Velocity */}
      {velocity && <SpendingVelocityCard velocity={velocity} currency={currency} />}

      {/* Monthly Spending Chart */}
      <MonthlySpendingChart data={monthlySpending} currency={currency} />

      {/* Year Summary + Category Breakdown */}
      <section className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {yearSummary && <YearSummaryCard summary={yearSummary} currency={currency} />}
        <CategoryBreakdownChart data={categorySpending} currency={currency} />
      </section>
    </div>
  )
}
