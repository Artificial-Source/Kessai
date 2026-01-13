import { useEffect } from 'react'
import { DollarSign, TrendingUp, CreditCard, Calendar } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/currency'
import { getUpcomingPayments, formatShortDate, getDaysUntil } from '@/lib/date-utils'
import { StatsCard } from '@/components/dashboard/stats-card'
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown'
import { MonthlyTrendChart } from '@/components/dashboard/monthly-trend-chart'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import type { CurrencyCode } from '@/lib/currency'

export function Dashboard() {
  const { subscriptions, isLoading, fetch: fetchSubscriptions } = useSubscriptionStore()
  const { fetch: fetchCategories } = useCategoryStore()
  const { settings, fetch: fetchSettings } = useSettingsStore()
  const { categorySpending, monthlySpending, totalMonthly, totalYearly, activeCount } =
    useDashboardStats()

  const currency = (settings?.currency || 'USD') as CurrencyCode
  const upcomingPayments = getUpcomingPayments(subscriptions, 7)

  useEffect(() => {
    fetchSubscriptions()
    fetchCategories()
    fetchSettings()
  }, [fetchSubscriptions, fetchCategories, fetchSettings])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-aurora-purple h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Your subscription overview at a glance</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="Monthly Spend"
          value={formatCurrency(totalMonthly, currency)}
          icon={<DollarSign className="h-6 w-6" />}
          color="text-aurora-purple"
        />
        <StatsCard
          title="Yearly Spend"
          value={formatCurrency(totalYearly, currency)}
          icon={<TrendingUp className="h-6 w-6" />}
          color="text-aurora-blue"
        />
        <StatsCard
          title="Active Subscriptions"
          value={activeCount.toString()}
          icon={<CreditCard className="h-6 w-6" />}
          color="text-success"
          animate={false}
        />
        <StatsCard
          title="Upcoming (7 days)"
          value={upcomingPayments.length.toString()}
          icon={<Calendar className="h-6 w-6" />}
          color="text-warning"
          animate={false}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Spending by Category</h2>
          <CategoryBreakdown data={categorySpending} currency={currency} />
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Monthly Trend</h2>
          <MonthlyTrendChart data={monthlySpending} currency={currency} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Upcoming Payments</h2>
          {upcomingPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="mb-2 text-4xl">🎉</div>
              <p className="text-muted-foreground">No payments in the next 7 days</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingPayments.slice(0, 5).map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between rounded-lg bg-white/5 p-3"
                >
                  <div className="flex items-center gap-3">
                    <SubscriptionLogo
                      logoUrl={sub.logo_url}
                      name={sub.name}
                      color={sub.color}
                      size="md"
                    />
                    <div>
                      <p className="font-medium">{sub.name}</p>
                      <p className="text-muted-foreground text-sm">
                        {sub.next_payment_date && formatShortDate(sub.next_payment_date)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium">{formatCurrency(sub.amount, currency)}</p>
                    <p className="text-muted-foreground text-sm">
                      {sub.next_payment_date && `in ${getDaysUntil(sub.next_payment_date)} days`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Quick Stats</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Average per subscription</span>
              <span className="font-medium">
                {activeCount > 0
                  ? formatCurrency(totalMonthly / activeCount, currency)
                  : formatCurrency(0, currency)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Total subscriptions</span>
              <span className="font-medium">{subscriptions.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Inactive subscriptions</span>
              <span className="font-medium">{subscriptions.length - activeCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Categories used</span>
              <span className="font-medium">{categorySpending.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Daily average</span>
              <span className="font-medium">{formatCurrency(totalMonthly / 30, currency)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
