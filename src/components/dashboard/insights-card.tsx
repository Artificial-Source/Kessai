import { memo } from 'react'
import { Lightbulb } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

interface InsightsCardProps {
  activeCount: number
  totalMonthly: number
  subscriptionCount: number
  currency: CurrencyCode
}

export const InsightsCard = memo(function InsightsCard({
  activeCount,
  totalMonthly,
  subscriptionCount,
  currency,
}: InsightsCardProps) {
  return (
    <div className="glass-card border-primary/20 from-primary/8 flex flex-col rounded-xl bg-gradient-to-br to-transparent p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-primary/20 text-primary flex h-8 w-8 items-center justify-center rounded-full">
          <Lightbulb className="h-4 w-4" />
        </div>
        <h3 className="text-foreground text-lg font-semibold tracking-tight">Insights</h3>
      </div>
      <div className="flex flex-col gap-6">
        <InsightItem
          color="bg-accent-cyan"
          title="Average Cost"
          description={
            <>
              You spend{' '}
              <span className="text-foreground font-bold">
                {activeCount > 0
                  ? formatCurrency(totalMonthly / activeCount, currency)
                  : formatCurrency(0, currency)}
              </span>{' '}
              per subscription on average.
            </>
          }
        />
        <div className="bg-border h-px w-full" />
        <InsightItem
          color="bg-success"
          title="Daily Breakdown"
          description={
            <>
              That's about{' '}
              <span className="text-foreground font-bold">
                {formatCurrency(totalMonthly / 30, currency)}
              </span>{' '}
              per day for all your subscriptions.
            </>
          }
        />
      </div>
      <div className="mt-auto pt-6">
        <div className="border-border bg-muted/45 rounded-xl border p-4">
          <p className="text-muted-foreground mb-1 text-xs">Total Active</p>
          <div className="flex items-end gap-2">
            <span className="text-foreground text-xl font-bold">{subscriptionCount}</span>
            <span className="text-muted-foreground mb-1 text-[10px]">subscriptions</span>
          </div>
        </div>
      </div>
    </div>
  )
})

const InsightItem = memo(function InsightItem({
  color,
  title,
  description,
}: {
  color: string
  title: string
  description: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${color}`} />
      <div>
        <p className="text-foreground mb-1 text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  )
})
