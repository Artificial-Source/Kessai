import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { CalendarDays, Calendar, CalendarClock, CreditCard } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/currency'
import { getUpcomingPayments } from '@/lib/date-utils'
import { StatCard } from '@/components/dashboard/stat-card'
import { UpcomingPaymentRow } from '@/components/dashboard/upcoming-payment-row'
import { InsightsCard } from '@/components/dashboard/insights-card'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
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
  const {
    categorySpending,
    totalMonthly,
    activeCount,
    monthlySubsTotal,
    yearlySubsTotal,
    monthlySubsCount,
    yearlySubsCount,
  } = useDashboardStats()

  const currency = (settings?.currency || 'USD') as CurrencyCode
  const upcomingPayments = getUpcomingPayments(subscriptions, 7)
  const upcomingTotal = upcomingPayments.reduce((sum, sub) => sum + sub.amount, 0)

  useEffect(() => {
    fetchSubscriptions()
    fetchCategories()
    fetchSettings()
  }, [fetchSubscriptions, fetchCategories, fetchSettings])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="animate-fade-in-up flex flex-col space-y-6">
      <header className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground text-sm">Here's your subscription overview</p>
      </header>

      <section className="stagger-children grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Monthly Subscriptions"
          value={formatCurrency(monthlySubsTotal, currency)}
          subtitle={`${monthlySubsCount} subscription${monthlySubsCount !== 1 ? 's' : ''}`}
          icon={CalendarDays}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <StatCard
          label="Yearly Subscriptions"
          value={formatCurrency(yearlySubsTotal, currency)}
          subtitle={`${yearlySubsCount} subscription${yearlySubsCount !== 1 ? 's' : ''}`}
          icon={Calendar}
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
          label="Active Subscriptions"
          value={activeCount.toString()}
          subtitle={`${formatCurrency(totalMonthly, currency)}/mo total`}
          icon={CreditCard}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
        />
      </section>

      {/* Category Breakdown */}
      {categorySpending.length > 0 && (
        <section className="glass-card p-6">
          <h3 className="mb-4 text-lg font-bold">Spending by Category</h3>
          <div className="flex flex-col gap-3">
            {categorySpending.slice(0, 5).map((cat) => (
              <div key={cat.id} className="flex items-center gap-3">
                <div
                  className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="text-foreground min-w-[120px] font-[family-name:var(--font-mono)] text-xs">
                  {cat.name}
                </span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-sm"
                    style={{
                      width: `${cat.percentage}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
                <span className="text-muted-foreground min-w-[80px] text-right font-[family-name:var(--font-mono)] text-xs">
                  {formatCurrency(cat.amount, currency)}
                </span>
                <span className="text-muted-foreground w-12 text-right font-[family-name:var(--font-mono)] text-[10px]">
                  {cat.percentage.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-6 lg:flex-row">
        <div className="glass-card flex-1 p-6">
          <h3 className="mb-5 text-lg font-bold">Upcoming Payments</h3>
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
