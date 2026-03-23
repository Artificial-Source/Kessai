import { memo } from 'react'
import { Lightbulb } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

interface InsightsCardProps {
  activeCount: number
  totalMonthly: number
  currency: CurrencyCode
  sharedSubscriptionCount?: number
  sharingSavingsMonthly?: number
}

export const InsightsCard = memo(function InsightsCard({
  activeCount,
  totalMonthly,
  currency,
  sharedSubscriptionCount = 0,
  sharingSavingsMonthly = 0,
}: InsightsCardProps) {
  return (
    <div className="glass-card border-primary/20 flex w-full flex-col p-6 lg:w-[320px] lg:shrink-0 xl:w-[360px]">
      <div className="mb-5 flex items-center gap-3">
        <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
          <Lightbulb className="h-4 w-4" />
        </div>
        <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
          Insights
        </h3>
      </div>
      <div className="flex flex-col gap-5">
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
          color="bg-emerald-400"
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
        {sharedSubscriptionCount > 0 && sharingSavingsMonthly > 0 && (
          <>
            <div className="bg-border h-px w-full" />
            <InsightItem
              color="bg-primary"
              title="Sharing Savings"
              description={
                <>
                  Sharing {sharedSubscriptionCount} subscription
                  {sharedSubscriptionCount !== 1 ? 's' : ''} saves you{' '}
                  <span className="text-foreground font-bold">
                    {formatCurrency(sharingSavingsMonthly, currency)}/mo
                  </span>
                  .
                </>
              }
            />
          </>
        )}
      </div>
      <div className="mt-auto pt-5">
        <div className="border-border rounded-lg border bg-[var(--color-subtle-overlay)] p-3 sm:p-4">
          <p className="text-muted-foreground mb-1 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            Projected Annual
          </p>
          <div className="flex items-end gap-2">
            <span className="text-foreground font-[family-name:var(--font-heading)] text-xl font-bold">
              {formatCurrency(totalMonthly * 12, currency)}
            </span>
            <span className="text-muted-foreground mb-1 font-[family-name:var(--font-mono)] text-[10px]">
              /year
            </span>
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
