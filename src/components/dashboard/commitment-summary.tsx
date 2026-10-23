import { memo, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  compareToTarget,
  excludedCount,
  figureSizeClass,
  listCurrencies,
  plural,
  targetVarianceLabel,
  type TargetComparison,
} from '@/lib/commitment'
import { formatCurrency } from '@/lib/currency'
import { cn } from '@/lib/utils'
import type { CategorySpending } from '@/hooks/use-dashboard-stats'

interface CommitmentSummaryProps {
  /** Monthly-equivalent user share in the display currency. */
  monthly: number
  yearly: number
  currency: string
  /** Subscriptions counted in the figures, and how many of them are trials. */
  countedCount: number
  trialCount: number
  excludedCurrencies: Record<string, number>
  /** Optional monthly target from Settings; null when none is set. */
  target: number | null
  /** Settings could not be read: the currency is a fallback and the target is unknown. */
  settingsUnavailable: boolean
  onRetrySettings: () => void
  categories: CategorySpending[]
}

/**
 * The one financial summary on the dashboard: monthly equivalent of the user's share,
 * the optional monthly target with its exact variance, and one currency-scope note for
 * everything in this section. Yearly equivalent and categories are folded under Breakdown.
 * Phones keep the figure, the variance and the scope note; the rest moves into Breakdown.
 */
export const CommitmentSummary = memo(function CommitmentSummary({
  monthly,
  yearly,
  currency,
  countedCount,
  trialCount,
  excludedCurrencies,
  target,
  settingsUnavailable,
  onRetrySettings,
  categories,
}: CommitmentSummaryProps) {
  const titleId = useId()
  const breakdownId = useId()
  const [open, setOpen] = useState(false)
  const figure = formatCurrency(monthly, currency)
  const excluded = excludedCount(excludedCurrencies)
  const comparison =
    target !== null && target > 0 ? compareToTarget(monthly, target, currency) : null
  const countLine =
    countedCount === 0
      ? `No billable subscriptions in ${currency}. Paused and cancelled ones are not counted.`
      : `${plural(countedCount, 'billable subscription')} in ${currency}${
          trialCount > 0
            ? `, including ${plural(trialCount, 'trial')} at ${trialCount === 1 ? 'its' : 'their'} recorded price`
            : ''
        }.`
  const targetLinks = (
    <>
      {comparison?.state === 'above' ? (
        <Button asChild variant="link" className="text-sm">
          <Link to="/subscriptions">Review subscriptions</Link>
        </Button>
      ) : null}
      <Button
        asChild
        variant="link"
        className="text-muted-foreground hover:text-foreground text-sm"
      >
        <Link to="/settings#budget">Edit target</Link>
      </Button>
    </>
  )

  return (
    <Card asChild padding="none" className="p-4 sm:p-5">
      <section aria-labelledby={titleId}>
        <div className="grid gap-x-10 gap-y-3 sm:gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,18rem)] md:items-start lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="min-w-0">
            <h2 id={titleId} className="type-label text-muted-foreground">
              Monthly equivalent
            </h2>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className={cn(
                  'text-foreground font-[family-name:var(--font-heading)] leading-none font-bold tracking-tight whitespace-nowrap tabular-nums',
                  figureSizeClass(figure)
                )}
              >
                {figure}
              </span>
              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-sm whitespace-nowrap">
                /mo · your share
              </span>
            </p>
            <p className="text-muted-foreground mt-2 hidden text-sm sm:block">{countLine}</p>
          </div>

          <div className="min-w-0">
            {settingsUnavailable ? (
              <div className="flex flex-col items-start gap-2">
                <h3 className="type-label text-muted-foreground">Monthly target</h3>
                <p className="text-muted-foreground text-sm">
                  Settings couldn&rsquo;t be loaded, so no target is shown and amounts use{' '}
                  {currency}.
                </p>
                <Button variant="outline" size="sm" onClick={onRetrySettings}>
                  Retry settings
                </Button>
              </div>
            ) : comparison && target !== null ? (
              <TargetMeter
                monthly={monthly}
                target={target}
                currency={currency}
                comparison={comparison}
                links={targetLinks}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <h3 className="type-label text-muted-foreground hidden sm:block">Monthly target</h3>
                <p className="text-muted-foreground text-sm">
                  No monthly target set.{' '}
                  <Button asChild variant="link" className="text-sm">
                    <Link to="/settings#budget">Set monthly target</Link>
                  </Button>
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="border-border mt-3 flex items-center justify-between gap-x-3 border-t pt-2.5 sm:gap-x-4">
          <p className="text-muted-foreground min-w-0 flex-1 text-sm text-pretty">
            {excluded > 0
              ? `${plural(excluded, 'subscription')} in ${listCurrencies(excludedCurrencies)} ${excluded === 1 ? 'is' : 'are'} not included. Kessai does not convert currencies.`
              : `Every billable subscription is in ${currency}.`}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="-mr-2 shrink-0"
            aria-expanded={open}
            aria-controls={breakdownId}
            onClick={() => setOpen((value) => !value)}
          >
            Breakdown
            <ChevronDown
              className={cn('transition-transform', open && 'rotate-180')}
              aria-hidden="true"
            />
          </Button>
        </div>

        {open ? (
          <div
            id={breakdownId}
            className="border-border mt-2 grid gap-x-10 gap-y-5 border-t pt-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
          >
            <div className="flex flex-col gap-1 sm:hidden">
              <p className="text-muted-foreground text-sm">{countLine}</p>
              {comparison ? <p className="flex flex-wrap gap-x-4">{targetLinks}</p> : null}
            </div>
            <div>
              <h3 className="type-label text-muted-foreground">Yearly equivalent</h3>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-2">
                <span className="text-foreground font-[family-name:var(--font-heading)] text-xl leading-none font-bold tracking-tight whitespace-nowrap tabular-nums">
                  {formatCurrency(yearly, currency)}
                </span>
                <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-sm">
                  /yr
                </span>
              </p>
              <p className="text-muted-foreground mt-2 text-xs">
                Your share at today&rsquo;s prices, not a record of what was paid this year.
              </p>
            </div>
            <div className="min-w-0">
              <h3 className="type-label text-muted-foreground">By category, monthly</h3>
              {categories.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2.5">
                  {categories.map((category) => (
                    <li
                      key={category.id}
                      className="grid grid-cols-[minmax(0,1fr)_auto_2.5rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto_2.5rem]"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-full"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="text-foreground truncate text-sm">{category.name}</span>
                      </span>
                      <span
                        aria-hidden="true"
                        className="bg-accent-muted relative col-span-3 row-start-2 h-1.5 overflow-hidden rounded-sm sm:col-span-1 sm:row-start-auto"
                      >
                        <span
                          className="bg-foreground/60 absolute inset-y-0 left-0 rounded-sm"
                          style={{ width: `${Math.max(category.percentage, 1)}%` }}
                        />
                      </span>
                      <span className="text-foreground text-right font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums">
                        {formatCurrency(category.amount, currency)}
                      </span>
                      <span className="text-muted-foreground text-right font-[family-name:var(--font-mono)] text-xs tabular-nums">
                        {category.percentage.toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground mt-2 text-sm">
                  Nothing to break down in {currency} yet.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </Card>
  )
})

interface TargetMeterProps {
  monthly: number
  target: number
  currency: string
  comparison: TargetComparison
  links: ReactNode
}

/**
 * Linear meter against the target. The scale is the larger of the two amounts, so 132% is
 * drawn longer than 100%: the target is a marker, the part above it is red.
 */
function TargetMeter({ monthly, target, currency, comparison, links }: TargetMeterProps) {
  const scale = Math.max(monthly, target)
  const targetAt = (target / scale) * 100
  const within = (Math.min(monthly, target) / scale) * 100
  const above = comparison.state === 'above'
  const goal = formatCurrency(target, currency)

  return (
    <div className="flex flex-col gap-2">
      <div className="hidden items-baseline justify-between gap-3 sm:flex">
        <h3 className="type-label text-muted-foreground">Monthly target</h3>
        <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
          {goal}
        </span>
      </div>
      <div aria-hidden="true" className="relative py-1">
        <div className="bg-accent-muted relative h-2 overflow-hidden rounded-sm">
          <div
            className="bg-foreground/60 absolute inset-y-0 left-0"
            style={{ width: `${within}%` }}
          />
          {above ? (
            <div
              className="bg-destructive absolute inset-y-0"
              style={{ left: `${targetAt}%`, right: 0 }}
            />
          ) : null}
        </div>
        <div
          className="bg-foreground absolute inset-y-0 w-0.5 -translate-x-1/2 rounded-full"
          style={{ left: `${Math.min(targetAt, 99.5)}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm">
          <span className={cn('font-medium', above ? 'text-destructive' : 'text-foreground')}>
            {targetVarianceLabel(comparison, currency)}
          </span>
          <span className="text-muted-foreground sm:hidden"> · {goal} target</span>
        </p>
        <p className="text-muted-foreground hidden font-[family-name:var(--font-mono)] text-xs tabular-nums sm:block">
          {Math.round(comparison.percent)}% of target
        </p>
      </div>
      <p className="hidden flex-wrap gap-x-4 gap-y-1 sm:flex">{links}</p>
    </div>
  )
}
