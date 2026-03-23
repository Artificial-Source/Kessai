import { memo, useMemo, useState, useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import dayjs from 'dayjs'
import { TrendingUp } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { usePaymentStore } from '@/stores/payment-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { calculateMonthlyAmount } from '@/types/subscription'
import type { Payment } from '@/types/payment'

type RangeOption = 6 | 12

interface MonthDataPoint {
  month: string
  label: string
  amount: number
}

interface SpendingTrendsProps {
  currency: CurrencyCode
}

function buildMonthlyData(
  payments: Payment[],
  subscriptions: ReturnType<typeof useSubscriptionStore.getState>['subscriptions'],
  range: RangeOption
): MonthDataPoint[] {
  const now = dayjs()
  const months: MonthDataPoint[] = []

  // Build a map of actual payment totals by month (only 'paid' status)
  const paymentsByMonth = new Map<string, number>()
  for (const payment of payments) {
    if (payment.status !== 'paid') continue
    const key = dayjs(payment.paid_at).format('YYYY-MM')
    paymentsByMonth.set(key, (paymentsByMonth.get(key) ?? 0) + payment.amount)
  }

  // Calculate projected monthly cost from active subscriptions
  const activeSubscriptions = subscriptions.filter((s) => s.is_active)
  const projectedMonthly = activeSubscriptions.reduce(
    (sum, sub) => sum + calculateMonthlyAmount(sub.amount, sub.billing_cycle),
    0
  )

  for (let i = range - 1; i >= 0; i--) {
    const monthDate = now.subtract(i, 'month')
    const key = monthDate.format('YYYY-MM')
    const actualAmount = paymentsByMonth.get(key)

    months.push({
      month: key,
      label: monthDate.format('MMM'),
      // Use actual payment data if available, otherwise projected
      amount: Math.round((actualAmount ?? projectedMonthly) * 100) / 100,
    })
  }

  return months
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
  const dataPoint = entry.payload as MonthDataPoint | undefined
  const value = entry.value as number | undefined
  if (!dataPoint || value === null || value === undefined) return null

  const monthLabel = dayjs(dataPoint.month + '-01').format('MMMM YYYY')

  return (
    <div className="glass-card px-3 py-2 shadow-lg">
      <p className="text-muted-foreground mb-1 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
        {monthLabel}
      </p>
      <p className="text-foreground font-[family-name:var(--font-heading)] text-sm font-bold">
        {formatCurrency(value, currency)}
      </p>
    </div>
  )
}

export const SpendingTrends = memo(function SpendingTrends({ currency }: SpendingTrendsProps) {
  const [range, setRange] = useState<RangeOption>(6)

  const subscriptions = useSubscriptionStore((state) => state.subscriptions)
  const { payments, fetchPayments } = usePaymentStore(
    useShallow((state) => ({
      payments: state.payments,
      fetchPayments: state.fetchPayments,
    }))
  )

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  const data = useMemo(
    () => buildMonthlyData(payments, subscriptions, range),
    [payments, subscriptions, range]
  )

  const maxAmount = useMemo(() => {
    const max = Math.max(...data.map((d) => d.amount), 0)
    // Add 20% headroom for visual breathing room
    return Math.ceil(max * 1.2)
  }, [data])

  const totalForRange = useMemo(() => data.reduce((sum, d) => sum + d.amount, 0), [data])

  const avgMonthly = useMemo(
    () => (data.length > 0 ? totalForRange / data.length : 0),
    [totalForRange, data.length]
  )

  const handleToggle = useCallback((newRange: RangeOption) => {
    setRange(newRange)
  }, [])

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-primary/15 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
              Spending Trends
            </h3>
            <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
              Avg {formatCurrency(avgMonthly, currency)}/mo
            </p>
          </div>
        </div>

        <div className="border-border flex overflow-hidden rounded-none border">
          <button
            onClick={() => handleToggle(6)}
            className={`min-w-[40px] px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors ${
              range === 6
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-foreground bg-transparent'
            }`}
          >
            6M
          </button>
          <button
            onClick={() => handleToggle(12)}
            className={`border-border min-w-[40px] border-l px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors ${
              range === 12
                ? 'bg-primary text-white'
                : 'text-muted-foreground hover:text-foreground bg-transparent'
            }`}
          >
            12M
          </button>
        </div>
      </div>

      <div className="h-[180px] w-full sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id="spendingGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#bf5af2" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#bf5af2" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line-color)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{
                fill: '#888888',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{
                fill: '#888888',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
              }}
              domain={[0, maxAmount]}
              tickFormatter={(value: number) => {
                if (value >= 1000) return `${(value / 1000).toFixed(1)}k`
                return value.toString()
              }}
            />
            <Tooltip content={tooltipRenderer} cursor={{ stroke: 'rgba(191,90,242,0.3)' }} />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#bf5af2"
              strokeWidth={2}
              fill="url(#spendingGradient)"
              dot={false}
              activeDot={{
                r: 4,
                fill: '#bf5af2',
                stroke: '#0a0a0a',
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
})
