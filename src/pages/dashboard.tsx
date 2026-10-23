import { useEffect, useId, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { AlertTriangle, CalendarCheck, RotateCw } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { formatCurrency } from '@/lib/currency'
import { excludedCurrenciesNote } from '@/lib/totals'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/dashboard/stat-card'
import { UpcomingPaymentRow } from '@/components/dashboard/upcoming-payment-row'
import { TrialsWidget } from '@/components/dashboard/trials-widget'
import { BudgetWidget } from '@/components/dashboard/budget-widget'
import { CategoryBreakdown } from '@/components/dashboard/category-breakdown'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { FirstRunEmptyState } from '@/components/subscriptions/first-run-empty-state'
import {
  BILLED_MONTHLY_LABEL,
  BILLED_YEARLY_LABEL,
  periodTotalLabel,
  periodTotalSuffix,
} from '@/components/subscriptions/subscription-display'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { calculateNormalizedAmount, NORMALIZATION_SUFFIXES } from '@/types/subscription'
import type { CurrencyCode } from '@/lib/currency'

/** Shown instead of a figure when the data behind it failed to load. */
const NOT_LOADED = '—'

export function Dashboard() {
  const {
    subscriptions,
    isLoading,
    error: subscriptionsError,
    fetch: fetchSubscriptions,
  } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
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
    excludedCurrencies,
    activeCount,
    monthlySubsTotal,
    monthlySubsCount,
    monthlySubsExcludedCurrencies,
    yearlySubsTotal,
    yearlySubsCount,
    yearlySubsExcludedCurrencies,
    upcomingPayments,
    upcomingTotal,
    upcomingExcludedCurrencies,
  } = useDashboardStats()
  const totalsNote = excludedCurrenciesNote(excludedCurrencies)
  const monthlySubsNote = excludedCurrenciesNote(monthlySubsExcludedCurrencies)
  const yearlySubsNote = excludedCurrenciesNote(yearlySubsExcludedCurrencies)
  const upcomingNote = excludedCurrenciesNote(upcomingExcludedCurrencies)
  const upcomingTitleId = useId()

  const costNormalization = useUiStore((s) => s.costNormalization)
  const isNormalized = costNormalization !== 'as-is'
  const normSuffix = isNormalized ? NORMALIZATION_SUFFIXES[costNormalization] : ''

  const normalizedMonthly = isNormalized
    ? calculateNormalizedAmount(monthlySubsTotal, 'monthly', costNormalization)
    : monthlySubsTotal
  const normalizedYearly = isNormalized
    ? calculateNormalizedAmount(yearlySubsTotal, 'yearly', costNormalization)
    : yearlySubsTotal
  const periodTotal = isNormalized
    ? calculateNormalizedAmount(totalMonthly, 'monthly', costNormalization)
    : totalMonthly

  const trials = useMemo(
    () => subscriptions.filter((s) => s.status === 'trial' && s.is_active),
    [subscriptions]
  )

  useEffect(() => {
    fetchSubscriptions()
    fetchCategories()
    fetchSettings()
  }, [fetchSubscriptions, fetchCategories, fetchSettings])

  // The dashboard refetches on mount, so an error here means its own load failed:
  // show that plainly instead of zeros or "nothing due".
  const loadFailed = Boolean(subscriptionsError)
  const showSkeleton = isLoading && subscriptions.length === 0 && !loadFailed
  const isFirstRun = !loadFailed && !isLoading && subscriptions.length === 0
  const hasBudget = monthlyBudget !== null && monthlyBudget > 0
  const showSideColumn =
    !loadFailed && (hasBudget || trials.length > 0 || categorySpending.length > 0)
  const countLabel = (count: number, noun = 'subscription') =>
    `${count} ${noun}${count === 1 ? '' : 's'}`

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          Totals use your share in {currency}. Other currencies are not converted.
        </p>
      </header>

      <WebBackendBanner error={subscriptionsError || categoriesError || settingsError} />

      {showSkeleton ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section
            aria-label="Totals"
            className="stagger-children grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4 xl:gap-6"
          >
            <StatCard
              label={periodTotalLabel(costNormalization)}
              value={loadFailed ? NOT_LOADED : formatCurrency(periodTotal, currency)}
              unit={loadFailed ? undefined : periodTotalSuffix(costNormalization)}
              subtitle={loadFailed ? undefined : countLabel(activeCount, 'active subscription')}
              note={loadFailed ? null : totalsNote}
            />
            <StatCard
              label={BILLED_MONTHLY_LABEL}
              value={loadFailed ? NOT_LOADED : formatCurrency(normalizedMonthly, currency)}
              unit={loadFailed ? undefined : normSuffix || '/mo'}
              subtitle={loadFailed ? undefined : countLabel(monthlySubsCount)}
              note={loadFailed ? null : monthlySubsNote}
            />
            <StatCard
              label={BILLED_YEARLY_LABEL}
              value={loadFailed ? NOT_LOADED : formatCurrency(normalizedYearly, currency)}
              unit={loadFailed ? undefined : normSuffix || '/yr'}
              subtitle={loadFailed ? undefined : countLabel(yearlySubsCount)}
              note={loadFailed ? null : yearlySubsNote}
            />
            <StatCard
              label="Due this week"
              value={loadFailed ? NOT_LOADED : upcomingPayments.length.toString()}
              subtitle={
                !loadFailed && upcomingPayments.length > 0
                  ? `${formatCurrency(upcomingTotal, currency)} total`
                  : undefined
              }
              note={loadFailed ? null : upcomingNote}
            />
          </section>

          {/* Grid items default to min-width: auto, so one long name in a truncating row would
              widen the whole column past a phone screen; every track and item here is min-w-0. */}
          <div
            className={cn(
              'grid grid-cols-1 items-start gap-4 md:gap-5 xl:gap-6',
              showSideColumn && 'lg:grid-cols-5'
            )}
          >
            <Card asChild className={cn('min-w-0', showSideColumn && 'lg:col-span-3')}>
              <section aria-labelledby={upcomingTitleId}>
                <CardHeader
                  action={
                    !loadFailed && upcomingPayments.length > 0 ? (
                      <div className="text-right">
                        <p className="text-foreground font-[family-name:var(--font-mono)] text-base font-bold tabular-nums">
                          {formatCurrency(upcomingTotal, currency)}
                        </p>
                        <p className="type-label text-muted-foreground">Due total</p>
                      </div>
                    ) : null
                  }
                >
                  <CardTitle id={upcomingTitleId}>Upcoming payments</CardTitle>
                  <CardDescription>Next 7 days</CardDescription>
                  {!loadFailed && upcomingNote && (
                    <p className="text-muted-foreground text-xs">{upcomingNote}</p>
                  )}
                </CardHeader>

                {loadFailed ? (
                  <EmptyState
                    icon={AlertTriangle}
                    tone="danger"
                    variant="plain"
                    size="compact"
                    headingLevel="h3"
                    title="Couldn’t load your subscriptions"
                    description="Totals and upcoming payments will show once Kessai can read your data."
                    action={
                      <Button variant="outline" onClick={() => fetchSubscriptions()}>
                        <RotateCw aria-hidden="true" />
                        Retry
                      </Button>
                    }
                  />
                ) : isFirstRun ? (
                  <FirstRunEmptyState variant="plain" headingLevel="h3" />
                ) : upcomingPayments.length === 0 ? (
                  <EmptyState
                    icon={CalendarCheck}
                    variant="plain"
                    size="compact"
                    headingLevel="h3"
                    title="Nothing due in the next 7 days"
                    description="Renewals show up here a week before they bill."
                  />
                ) : (
                  <ul className="divide-border mt-2 divide-y">
                    {upcomingPayments.slice(0, 6).map((sub) => (
                      <UpcomingPaymentRow key={sub.id} subscription={sub} currency={currency} />
                    ))}
                  </ul>
                )}
              </section>
            </Card>

            {showSideColumn && (
              <div className="flex min-w-0 flex-col gap-4 md:gap-5 lg:col-span-2 xl:gap-6">
                {hasBudget && monthlyBudget !== null && (
                  <BudgetWidget
                    budget={monthlyBudget}
                    currentSpend={totalMonthly}
                    currency={currency}
                    note={totalsNote}
                  />
                )}
                <TrialsWidget trials={trials} />
                {categorySpending.length > 0 && (
                  <CategoryBreakdown
                    categories={categorySpending}
                    currency={currency}
                    note={totalsNote}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
