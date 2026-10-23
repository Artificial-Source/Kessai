import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import dayjs from 'dayjs'
import { AlertTriangle, Plus, RotateCw } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { useDashboardStats } from '@/hooks/use-dashboard-stats'
import { useRecentPriceChanges } from '@/hooks/use-recent-price-changes'
import { useRenewalLedger } from '@/hooks/use-renewal-ledger'
import { useToday } from '@/hooks/use-today'
import { isWebApiUnavailableError } from '@/lib/api'
import { buildDecisions, buildReviewCandidates } from '@/lib/dashboard-decisions'
import { nextRenewalAfter } from '@/lib/renewal-ledger'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { CommitmentSummary } from '@/components/dashboard/commitment-summary'
import { DashboardSkeleton } from '@/components/dashboard/dashboard-skeleton'
import { DecisionRail } from '@/components/dashboard/decision-rail'
import { RenewalLedger } from '@/components/dashboard/renewal-ledger'
import { UrgentDecisions } from '@/components/dashboard/urgent-decisions'
import { FirstRunEmptyState } from '@/components/subscriptions/first-run-empty-state'

/** The full Decisions heading in the rail; the phone preview moves focus to it. */
const DECISIONS_HEADING_ID = 'dashboard-decisions'

/**
 * Home: what charges next and what needs a decision before it does. One commitment summary
 * (monthly equivalent, target), the 30-day renewal ledger with in-place Mark paid / Skip,
 * and a rail of Decisions, Worth reviewing and this month's records.
 */
export function Dashboard() {
  const {
    subscriptions,
    fetchError,
    fetch: fetchSubscriptions,
  } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      fetchError: state.fetchError,
      fetch: state.fetch,
    }))
  )
  const fetchCategories = useCategoryStore((state) => state.fetch)
  const categoriesError = useCategoryStore((state) => state.error)
  const fetchSettings = useSettingsStore((state) => state.fetch)
  const settingsError = useSettingsStore((state) => state.error)
  const settings = useSettingsStore((state) => state.settings)
  const openSubscriptionDialog = useUiStore((state) => state.openSubscriptionDialog)
  const currency = settings?.currency || 'USD'
  const monthlyBudget = settings?.monthly_budget ?? null

  const today = useToday()
  const stats = useDashboardStats()
  const schedule = useRenewalLedger(today, currency)
  // An amount or currency edit is what records a price change: read the history again then.
  const priceRevision = useMemo(
    () => subscriptions.map((s) => `${s.id}:${s.amount}:${s.currency}`).join('|'),
    [subscriptions]
  )
  const priceChanges = useRecentPriceChanges(priceRevision)
  const decisions = useMemo(
    () => buildDecisions(subscriptions, priceChanges.changes, today),
    [subscriptions, priceChanges.changes, today]
  )
  const candidates = useMemo(
    () =>
      buildReviewCandidates(subscriptions, {
        today,
        displayCurrency: currency,
        exclude: new Set(decisions.map((decision) => decision.subscription.id)),
      }),
    [subscriptions, today, currency, decisions]
  )
  const nextRenewal = useMemo(
    () => nextRenewalAfter(subscriptions, schedule.ledger.window.end),
    [subscriptions, schedule.ledger.window.end]
  )

  // The first fetch decides between first run and data; until then a stored list (from
  // another route) renders right away and an empty one shows the skeleton.
  const [loadedOnce, setLoadedOnce] = useState(false)
  useEffect(() => {
    let live = true
    void fetchSubscriptions().finally(() => {
      if (live) setLoadedOnce(true)
    })
    fetchCategories()
    fetchSettings()
    return () => {
      live = false
    }
  }, [fetchSubscriptions, fetchCategories, fetchSettings])

  const hasSubscriptions = subscriptions.length > 0
  const showSkeleton = !hasSubscriptions && !loadedOnce && !fetchError
  // Failure is not emptiness: without a list there is nothing honest to total.
  const loadFailed = !hasSubscriptions && Boolean(fetchError)
  const isFirstRun = !hasSubscriptions && loadedOnce && !fetchError
  const settingsUnavailable = !settings && Boolean(settingsError)

  return (
    <div className="animate-fade-in-up flex min-h-full flex-col gap-5 xl:gap-6">
      <header className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            <time dateTime={today}>{dayjs(today).format('dddd, MMMM D')}</time>
          </p>
        </div>
        {isFirstRun ? null : (
          <Button
            variant="glow"
            className="max-sm:size-11 max-sm:px-0"
            onClick={() => openSubscriptionDialog()}
          >
            <Plus aria-hidden="true" />
            <span className="max-sm:sr-only">Add Subscription</span>
          </Button>
        )}
      </header>

      <WebBackendBanner error={fetchError || categoriesError || settingsError} />

      {showSkeleton ? (
        <DashboardSkeleton />
      ) : loadFailed ? (
        <EmptyState
          icon={AlertTriangle}
          tone="danger"
          title="Couldn’t load your subscriptions"
          description="Monthly figures and upcoming charges show once Kessai can read your data."
          action={
            <Button variant="outline" onClick={() => void fetchSubscriptions()}>
              <RotateCw aria-hidden="true" />
              Retry
            </Button>
          }
        />
      ) : isFirstRun ? (
        <FirstRunEmptyState />
      ) : (
        <>
          {fetchError && !isWebApiUnavailableError(fetchError) ? (
            <Card
              tone="warning"
              padding="sm"
              role="alert"
              className="flex flex-col gap-3 sm:flex-row sm:items-center"
            >
              <p className="text-foreground min-w-0 flex-1 text-sm">
                Couldn&rsquo;t refresh your subscriptions. Showing what was last loaded.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="self-start sm:self-center"
                onClick={() => void fetchSubscriptions()}
              >
                <RotateCw aria-hidden="true" />
                Retry
              </Button>
            </Card>
          ) : null}

          <CommitmentSummary
            monthly={stats.totalMonthly}
            yearly={stats.totalYearly}
            currency={currency}
            countedCount={stats.countedCount}
            trialCount={stats.trialCount}
            excludedCurrencies={stats.excludedCurrencies}
            target={monthlyBudget}
            settingsUnavailable={settingsUnavailable}
            onRetrySettings={() => void fetchSettings()}
            categories={stats.categorySpending}
          />

          <UrgentDecisions
            className="lg:hidden"
            decisions={decisions}
            onReview={openSubscriptionDialog}
            decisionsHeadingId={DECISIONS_HEADING_ID}
          />

          {/* Grid items default to min-width: auto, so one long name in a truncating row would
              widen the column past a phone screen; every track and item here is min-w-0. */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-6">
            <RenewalLedger
              ledger={schedule.ledger}
              displayCurrency={currency}
              isLoading={schedule.isLoading}
              error={schedule.error}
              onRetry={schedule.refetch}
              nextRenewal={nextRenewal}
            />
            <DecisionRail
              decisions={decisions}
              priceChangesError={priceChanges.error}
              candidates={candidates}
              displayCurrency={currency}
              today={today}
              records={schedule.records}
              recordsState={schedule.isLoading ? 'loading' : schedule.error ? 'error' : 'ready'}
              onReview={openSubscriptionDialog}
              decisionsHeadingId={DECISIONS_HEADING_ID}
            />
          </div>
        </>
      )}
    </div>
  )
}
