import { memo, useId } from 'react'
import { Card } from '@/components/ui/card'

interface StatCardProps {
  label: string
  value: string
  /** Period the figure covers, e.g. "/mo". Set beside the value, smaller and muted. */
  unit?: string
  subtitle?: string
  /** What the figure leaves out, e.g. "Excludes 2 in EUR, JPY". Sits right under it. */
  note?: string | null
}

/**
 * One headline figure. Static: stat cards are not controls, so they do not react to hover.
 * Phones lay these out two abreast, so the figure steps down a size and may wrap rather than
 * push the grid wider than the screen: the value may break anywhere, the unit never does and
 * moves to the next line whole.
 */
export const StatCard = memo(function StatCard({
  label,
  value,
  unit,
  subtitle,
  note,
}: StatCardProps) {
  const labelId = useId()

  return (
    <Card role="group" aria-labelledby={labelId} className="flex min-w-0 flex-col p-4 md:p-5">
      <p id={labelId} className="type-label text-muted-foreground">
        {label}
      </p>
      <p className="text-foreground mt-3 font-[family-name:var(--font-heading)] text-2xl leading-none font-bold tracking-tight tabular-nums md:text-3xl">
        <span className="[overflow-wrap:anywhere]">{value}</span>
        {unit ? (
          <>
            {' '}
            <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs font-normal tracking-normal whitespace-nowrap md:text-sm">
              {unit}
            </span>
          </>
        ) : null}
      </p>
      {subtitle && <p className="text-muted-foreground mt-2 text-sm">{subtitle}</p>}
      {note && <p className="text-muted-foreground mt-1 text-xs text-pretty">{note}</p>}
    </Card>
  )
})
