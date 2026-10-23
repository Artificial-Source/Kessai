import { memo, useId } from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ProgressBar } from '@/components/ui/progress-bar'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import type { CategorySpending } from '@/hooks/use-dashboard-stats'

interface CategoryBreakdownProps {
  categories: CategorySpending[]
  currency: CurrencyCode
  /** What the totals leave out, e.g. "Excludes 2 in EUR, JPY". */
  note: string | null
}

const VISIBLE_CATEGORIES = 5

/**
 * Top categories by monthly share. Phones get two lines per category (name and amount,
 * then the bar and share) so the bar never collapses to a sliver.
 */
export const CategoryBreakdown = memo(function CategoryBreakdown({
  categories,
  currency,
  note,
}: CategoryBreakdownProps) {
  const titleId = useId()

  return (
    <Card asChild>
      <section aria-labelledby={titleId}>
        <CardHeader>
          <CardTitle id={titleId}>Spending by category</CardTitle>
          <CardDescription>Monthly, your share in {currency}.</CardDescription>
          {note && <p className="text-muted-foreground text-xs">{note}</p>}
        </CardHeader>
        <ul className="mt-4 flex flex-col gap-3.5">
          {categories.slice(0, VISIBLE_CATEGORIES).map((cat) => (
            <li
              key={cat.id}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_auto_2.75rem] lg:grid-cols-[minmax(0,1fr)_auto] xl:grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_auto_2.75rem]"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-foreground truncate text-sm">{cat.name}</span>
              </span>
              <span className="text-foreground text-right font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums sm:order-3 lg:order-none xl:order-3">
                {formatCurrency(cat.amount, currency)}
              </span>
              <ProgressBar
                value={cat.percentage}
                colorStyle={cat.color}
                height="sm"
                className="sm:order-2 lg:order-none xl:order-2"
              />
              <span className="text-muted-foreground text-right font-[family-name:var(--font-mono)] text-xs tabular-nums sm:order-4 lg:order-none xl:order-4">
                {cat.percentage.toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  )
})
