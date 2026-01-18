import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { DollarSign, CreditCard, CalendarClock, TrendingUp } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/currency'
import { CATEGORY_COLORS } from '@/lib/constants'
import { getUpcomingPayments } from '@/lib/date-utils'
import { DonutChart } from '@/components/charts/donut-chart'
import { AreaChart } from '@/components/charts/area-chart'
import { StatCard } from '@/components/dashboard/stat-card'
import { EmptyState } from '@/components/dashboard/empty-state'
import { UpcomingPaymentRow } from '@/components/dashboard/upcoming-payment-row'
import { InsightsCard } from '@/components/dashboard/insights-card'
import type { CurrencyCode } from '@/lib/currency'

export function Dashboard() {
  // Use selective subscriptions for better performance
  const {
    subscriptions,
    isLoading,
    fetch: fetchSubscriptions,
  } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      isLoading: state.isLoading,
      fetch: state.fetch,
    }))
  )
  const fetchCategories = useCategoryStore((state) => state.fetch)
  const { settings, fetch: fetchSettings } = useSettingsStore(
    useShallow((state) => ({
      settings: state.settings,
      fetch: state.fetch,
    }))
  )
  const { categorySpending, monthlySpending, totalMonthly, totalYearly, activeCount } =
    useDashboardStats()

  const currency = (settings?.currency || 'USD') as CurrencyCode
  const upcomingPayments = getUpcomingPayments(subscriptions, 7)
  const upcomingTotal = upcomingPayments.reduce((sum, sub) => sum + sub.amount, 0)

  useEffect(() => {
    fetchSubscriptions()
    fetchCategories()
    fetchSettings()
  }, [fetchSubscriptions, fetchCategories, fetchSettings])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  const donutSegments = categorySpending.slice(0, 4).map((cat) => ({
    value: cat.amount,
    color: CATEGORY_COLORS[cat.name] || CATEGORY_COLORS.Other,
    label: cat.name,
    percentage: totalMonthly > 0 ? Math.round((cat.amount / totalMonthly) * 100) : 0,
  }))

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-1">
        <h2 className="text-foreground text-3xl font-black tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1 text-base">Here's your subscription overview</p>
      </header>

      <section className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monthly Total"
          value={formatCurrency(totalMonthly, currency)}
          icon={DollarSign}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <StatCard
          label="Active Subscriptions"
          value={activeCount.toString()}
          subtitle={`Across ${categorySpending.length} categories`}
          icon={CreditCard}
          iconBg="bg-accent-cyan/10"
          iconColor="text-accent-cyan"
        />
        <StatCard
          label="Due This Week"
          value={upcomingPayments.length.toString()}
          subtitle={
            upcomingPayments.length > 0
              ? `${formatCurrency(upcomingTotal, currency)} total`
              : undefined
          }
          subtitleColor="text-accent-orange"
          icon={CalendarClock}
          iconBg="bg-accent-orange/10"
          iconColor="text-accent-orange"
        />
        <StatCard
          label="Yearly Estimate"
          value={formatCurrency(totalYearly, currency)}
          subtitle="Based on current plan"
          icon={TrendingUp}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
        />
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="glass-card flex flex-col rounded-2xl p-6">
          <h3 className="text-foreground mb-6 text-lg font-bold">Spending by Category</h3>
          {donutSegments.length === 0 ? (
            <EmptyState message="No spending data yet" />
          ) : (
            <DonutChart segments={donutSegments} total={totalMonthly} currency={currency} />
          )}
        </div>

        <div className="glass-card flex flex-col rounded-2xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <h3 className="text-foreground text-lg font-bold">Monthly Spending</h3>
            <div className="flex gap-2">
              <button className="bg-primary text-primary-foreground rounded px-2 py-1 text-xs font-medium">
                6M
              </button>
              <button className="text-muted-foreground hover:bg-muted hover:text-foreground rounded px-2 py-1 text-xs font-medium">
                1Y
              </button>
            </div>
          </div>
          {monthlySpending.length === 0 ? (
            <EmptyState message="No trend data yet" />
          ) : (
            <div className="relative min-h-[180px] w-full flex-1 px-2 pb-4">
              <AreaChart data={monthlySpending} />
              <div className="text-muted-foreground absolute bottom-0 flex w-full justify-between px-1 pb-1 text-[10px] font-medium">
                {monthlySpending.slice(-6).map((item) => (
                  <span key={item.month}>{item.monthLabel}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-6 lg:col-span-2">
          <h3 className="text-foreground mb-6 text-lg font-bold">Upcoming Payments</h3>
          {upcomingPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <span className="mb-2 text-4xl">🎉</span>
              <p className="text-muted-foreground">No payments in the next 7 days</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {upcomingPayments.slice(0, 4).map((sub) => (
                <UpcomingPaymentRow key={sub.id} subscription={sub} currency={currency} />
              ))}
            </div>
          )}
        </div>

        <InsightsCard
          activeCount={activeCount}
          totalMonthly={totalMonthly}
          subscriptionCount={subscriptions.length}
          currency={currency}
        />
      </section>
    </div>
  )
}
