import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { useShallow } from 'zustand/react/shallow'
import dayjs from 'dayjs'
import { CalendarDays, Calendar, CalendarClock, CreditCard, FlaskConical } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/currency'
import { getUpcomingPayments } from '@/lib/date-utils'
import { ProgressBar } from '@/components/ui/progress-bar'
import { StatCard } from '@/components/dashboard/stat-card'
import { UpcomingPaymentRow } from '@/components/dashboard/upcoming-payment-row'
import { InsightsCard } from '@/components/dashboard/insights-card'
import { SpendingTrends } from '@/components/dashboard/spending-trends'
import { TrialsWidget } from '@/components/dashboard/trials-widget'
import { BudgetWidget } from '@/components/dashboard/budget-widget'
import { TrialAlertCard } from '@/components/dashboard/trial-alert-card'
import { PriceChangesCard } from '@/components/dashboard/price-changes-card'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { ReviewNudgeCard } from '@/components/dashboard/review-nudge-card'
import { Button } from '@/components/ui/button'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { calculateNormalizedAmount, NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { CurrencyCode } from '@/lib/currency'

const WhatIfSimulator = lazy(() =>
  import('@/components/dashboard/what-if-simulator').then((m) => ({
    default: m.WhatIfSimulator,
  }))
)

export function Dashboard() {
  // Use selective subscriptions for better performance
  const {
    subscriptions,
    isLoading,
    error: subscriptionsError,
    fetch: fetchSubscriptions,
    fetchNeedingReview,
  } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      fetchNeedingReview: state.fetchNeedingReview,
    }))
  )
  const fetchCategories = useCategoryStore((state) => state.fetch)
  const categoriesError = useCategoryStore((state) => state.error)
  const fetchSettings = useSettingsStore((state) => state.fetch)
  const settingsError = useSettingsStore((state) => state.error)
  const currency = useSettingsStore((state) => (state.settings?.currency || 'USD') as CurrencyCode)
  const monthlyBudget = useSettingsStore((state) => state.settings?.monthly_budget ?? null)
  const {
    categorySpending,
    totalMonthly,
    activeCount,
    monthlySubsTotal,
    yearlySubsTotal,
    monthlySubsCount,
    yearlySubsCount,
  } = useDashboardStats()

  const costNormalization = useUiStore((s) => s.costNormalization)
  const [whatIfOpen, setWhatIfOpen] = useState(false)
  const isNormalized = costNormalization !== 'as-is'

  // Helper to convert totals-by-cycle to normalized amounts
  const normalizedMonthlyLabel = useMemo(() => {
    if (!isNormalized) return null
    // monthlySubsTotal is raw total of monthly-billed subs; convert to target
    const fromMonthly = calculateNormalizedAmount(monthlySubsTotal, 'monthly', costNormalization)
    return fromMonthly
  }, [isNormalized, monthlySubsTotal, costNormalization])

  const normalizedYearlyLabel = useMemo(() => {
    if (!isNormalized) return null
    const fromYearly = calculateNormalizedAmount(yearlySubsTotal, 'yearly', costNormalization)
    return fromYearly
  }, [isNormalized, yearlySubsTotal, costNormalization])

  const normalizedTotalMonthly = useMemo(() => {
    if (!isNormalized) return null
    return calculateNormalizedAmount(totalMonthly, 'monthly', costNormalization)
  }, [isNormalized, totalMonthly, costNormalization])

  const normSuffix = isNormalized ? NORMALIZATION_SUFFIXES[costNormalization] : ''

  // Trial stats for TrialsWidget
  const { trialCount, expiringTrials } = useMemo(() => {
    const trials = subscriptions.filter((s) => s.status === 'trial' && s.is_active)
    const weekEnd = dayjs().add(7, 'day')
    const expiring = trials.filter(
      (s) => s.trial_end_date && dayjs(s.trial_end_date).isBefore(weekEnd)
    )
    return { trialCount: trials.length, expiringTrials: expiring }
  }, [subscriptions])
  const { upcomingPayments, upcomingTotal } = useMemo(() => {
    const upcoming = getUpcomingPayments(subscriptions, 7)
    return {
      upcomingPayments: upcoming,
      upcomingTotal: upcoming.reduce((sum, sub) => sum + sub.amount, 0),
    }
  }, [subscriptions])

  useEffect(() => {
    fetchSubscriptions()
    fetchCategories()
    fetchSettings()
    fetchNeedingReview(30)
  }, [fetchSubscriptions, fetchCategories, fetchSettings, fetchNeedingReview])

  if (isLoading) {
    return <DashboardSkeleton />
  }

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground text-sm">Here's your subscription overview</p>
        </div>
        {activeCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setWhatIfOpen(true)} className="gap-2">
            <FlaskConical className="h-3.5 w-3.5" />
            What If...
          </Button>
        )}
      </header>

      <WebBackendBanner error={subscriptionsError || categoriesError || settingsError} />

      <section className="stagger-children grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5 lg:grid-cols-4 xl:gap-6">
        <StatCard
          label={isNormalized ? `Monthly Subs (${normSuffix})` : 'Monthly Subscriptions'}
          value={formatCurrency(
            isNormalized && normalizedMonthlyLabel !== null
              ? normalizedMonthlyLabel
              : monthlySubsTotal,
            currency
          )}
          subtitle={`${monthlySubsCount} subscription${monthlySubsCount !== 1 ? 's' : ''}`}
          icon={CalendarDays}
          iconBg="bg-surface-highest/50"
          iconColor="text-primary"
        />
        <StatCard
          label={isNormalized ? `Yearly Subs (${normSuffix})` : 'Yearly Subscriptions'}
          value={formatCurrency(
            isNormalized && normalizedYearlyLabel !== null
              ? normalizedYearlyLabel
              : yearlySubsTotal,
            currency
          )}
          subtitle={`${yearlySubsCount} subscription${yearlySubsCount !== 1 ? 's' : ''}`}
          icon={Calendar}
          iconBg="bg-surface-highest/50"
          iconColor="text-primary"
        />
        <StatCard
          label="Due This Week"
          value={upcomingPayments.length.toString()}
          subtitle={
            upcomingPayments.length > 0
              ? `${formatCurrency(upcomingTotal, currency)} total`
              : undefined
          }
          subtitleColor="text-primary"
          icon={CalendarClock}
          iconBg="bg-surface-highest/50"
          iconColor="text-primary"
        />
        <StatCard
          label="Active Subscriptions"
          value={activeCount.toString()}
          subtitle={
            isNormalized && normalizedTotalMonthly !== null
              ? `${formatCurrency(normalizedTotalMonthly, currency)}${normSuffix} total`
              : `${formatCurrency(totalMonthly, currency)}/mo total`
          }
          icon={CreditCard}
          iconBg="bg-surface-highest/50"
          iconColor="text-primary"
        />
      </section>

      {/* Budget Widget */}
      {monthlyBudget !== null && monthlyBudget > 0 && (
        <BudgetWidget budget={monthlyBudget} currentSpend={totalMonthly} currency={currency} />
      )}

      {/* Trials Widget */}
      <TrialsWidget expiringTrials={expiringTrials} trialCount={trialCount} />

      {/* Review Nudges */}
      <ReviewNudgeCard />

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
                <ProgressBar
                  value={cat.percentage}
                  colorStyle={cat.color}
                  height="sm"
                  rounded="sm"
                  className="flex-1"
                />
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

      <SpendingTrends currency={currency} />

      <TrialAlertCard subscriptions={subscriptions} />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <PriceChangesCard currency={currency} />

          <div className="glass-card p-6">
            <h3 className="mb-5 text-lg font-bold">Upcoming Payments</h3>
            {upcomingPayments.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border-hover)] bg-[var(--color-card)] py-12 text-center">
                <div className="bg-success/10 animate-gentle-float mb-4 rounded-full p-4">
                  <span className="text-3xl leading-none">🎉</span>
                </div>
                <p className="text-foreground mb-1 text-lg font-semibold">All caught up!</p>
                <p className="text-muted-foreground text-sm">No payments due in the next 7 days</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {upcomingPayments.slice(0, 4).map((sub) => (
                  <UpcomingPaymentRow key={sub.id} subscription={sub} currency={currency} />
                ))}
              </div>
            )}
          </div>
        </div>

        <InsightsCard activeCount={activeCount} totalMonthly={totalMonthly} currency={currency} />
      </section>

      <Suspense fallback={null}>
        <WhatIfSimulator open={whatIfOpen} onOpenChange={setWhatIfOpen} currency={currency} />
      </Suspense>
    </div>
  )
}
