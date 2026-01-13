import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency, formatCompactCurrency, type CurrencyCode } from '@/lib/currency'
import type { MonthlySpending } from '@/hooks/use-dashboard-stats'

type MonthlyTrendChartProps = {
  data: MonthlySpending[]
  currency?: CurrencyCode
}

export function MonthlyTrendChart({ data, currency = 'USD' }: MonthlyTrendChartProps) {
  const hasData = data.some((d) => d.amount > 0)

  if (!hasData) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center text-center">
        <div className="mb-2 text-4xl">📈</div>
        <p className="text-muted-foreground">No trend data yet</p>
        <p className="text-muted-foreground text-sm">Add subscriptions to see trends</p>
      </div>
    )
  }

  return (
    <div className="h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.6} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis
            dataKey="monthLabel"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#a1a1aa', fontSize: 12 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#a1a1aa', fontSize: 12 }}
            tickFormatter={(value) => formatCompactCurrency(value, currency)}
            width={50}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const amount = payload[0].value as number
              return (
                <div className="bg-card rounded-lg border border-white/10 px-3 py-2 shadow-lg">
                  <p className="font-medium">{label}</p>
                  <p className="text-aurora-purple text-sm">{formatCurrency(amount, currency)}</p>
                </div>
              )
            }}
          />
          <Area
            type="monotone"
            dataKey="amount"
            stroke="#8b5cf6"
            strokeWidth={2}
            fill="url(#colorSpend)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
