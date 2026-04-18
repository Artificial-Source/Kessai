import { memo, useMemo, useCallback } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import dayjs from 'dayjs'
import { BarChart3 } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import type { MonthlySpend } from '@/types/analytics'

interface MonthlySpendingChartProps {
  data: MonthlySpend[]
  currency: CurrencyCode
}

interface ChartDataPoint {
  month: string
  label: string
  total: number
}

function CustomTooltipContent({
  active,
  payload,
  currency,
}: {
  active?: boolean
  payload?: ReadonlyArray<Record<string, unknown>>
  currency: CurrencyCode
}) {
  if (!active || !payload || payload.length === 0) return null

  const entry = payload[0]
  const dataPoint = entry.payload as ChartDataPoint | undefined
  const value = entry.value as number | undefined
  if (!dataPoint || value === null || value === undefined) return null

  const monthLabel = dayjs(dataPoint.month + '-01').format('MMMM YYYY')

  return (
    <div className="glass-overlay px-3 py-2 shadow-lg">
      <p className="text-muted-foreground mb-1 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
        {monthLabel}
      </p>
      <p className="text-foreground font-[family-name:var(--font-heading)] text-sm font-bold">
        {formatCurrency(value, currency)}
      </p>
    </div>
  )
}

export const MonthlySpendingChart = memo(function MonthlySpendingChart({
  data,
  currency,
}: MonthlySpendingChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(
    () =>
      data.map((d) => ({
        month: d.month,
        label: dayjs(d.month + '-01').format('MMM'),
        total: Math.round(d.total * 100) / 100,
      })),
    [data]
  )

  const maxAmount = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.total), 0)
    return Math.ceil(max * 1.2)
  }, [chartData])

  const tooltipRenderer = useCallback(
    (props: Record<string, unknown>) => (
      <CustomTooltipContent
        active={props.active as boolean | undefined}
        payload={props.payload as ReadonlyArray<Record<string, unknown>> | undefined}
        currency={currency}
      />
    ),
    [currency]
  )

  return (
    <div className="glass-card p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="bg-surface-highest/50 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
          <BarChart3 className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
            Monthly Spending
          </h3>
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            Based on recorded payments
          </p>
        </div>
      </div>

      {chartData.length === 0 ? (
        <div className="flex h-[260px] items-center justify-center">
          <p className="text-muted-foreground text-sm">No payment data yet</p>
        </div>
      ) : (
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.9} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--grid-line-color)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: 'var(--color-muted-foreground)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{
                  fill: 'var(--color-muted-foreground)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                }}
                domain={[0, maxAmount]}
                tickFormatter={(value: number) => {
                  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
                  return value.toString()
                }}
              />
              <Tooltip
                content={tooltipRenderer}
                cursor={{ fill: 'var(--color-surface-highest)' }}
              />
              <Bar dataKey="total" fill="url(#barGradient)" radius={[2, 2, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
})
