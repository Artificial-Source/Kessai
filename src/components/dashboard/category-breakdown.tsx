import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import type { CategorySpending } from '@/hooks/use-dashboard-stats'

type CategoryBreakdownProps = {
  data: CategorySpending[]
  currency?: CurrencyCode
}

export function CategoryBreakdown({ data, currency = 'USD' }: CategoryBreakdownProps) {
  const total = data.reduce((sum, item) => sum + item.amount, 0)

  if (data.length === 0) {
    return (
      <div className="flex h-[300px] flex-col items-center justify-center text-center">
        <div className="mb-2 text-4xl">📊</div>
        <p className="text-muted-foreground">No spending data yet</p>
        <p className="text-muted-foreground text-sm">Add subscriptions to see breakdown</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={2}
              dataKey="amount"
              nameKey="name"
            >
              {data.map((entry) => (
                <Cell key={entry.id} fill={entry.color} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0].payload as CategorySpending
                return (
                  <div className="bg-card rounded-lg border border-white/10 px-3 py-2 shadow-lg">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-sm">
                      {formatCurrency(item.amount, currency)} ({item.percentage.toFixed(1)}%)
                    </p>
                  </div>
                )
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-2xl font-bold">{formatCurrency(total, currency)}</p>
          <p className="text-muted-foreground text-xs">monthly</p>
        </div>
      </div>

      <div className="space-y-2">
        {data.slice(0, 5).map((item) => (
          <div key={item.id} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
              <span className="text-sm">{item.name}</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium">{formatCurrency(item.amount, currency)}</span>
              <span className="text-muted-foreground ml-2 text-xs">
                {item.percentage.toFixed(0)}%
              </span>
            </div>
          </div>
        ))}
        {data.length > 5 && (
          <p className="text-muted-foreground text-center text-xs">
            +{data.length - 5} more categories
          </p>
        )}
      </div>
    </div>
  )
}
