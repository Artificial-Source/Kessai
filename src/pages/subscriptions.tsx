import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { AlertTriangle, CreditCard, Plus, RotateCw, Search } from 'lucide-react'
import { useSubscriptions } from '@/hooks/use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { FirstRunEmptyState } from '@/components/subscriptions/first-run-empty-state'
import { useCategoryStore } from '@/stores/category-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { formatPaymentDate } from '@/lib/date-utils'
import {
  findSubscriptionFocus,
  neighborSubscriptionId,
  pageHeading,
  refocusIfLost,
} from '@/lib/focus'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SubscriptionBento } from '@/components/subscriptions/subscription-bento'
import { SubscriptionsGridView } from '@/components/subscriptions/subscriptions-grid-view'
import { SubscriptionsListView } from '@/components/subscriptions/subscriptions-list-view'
import { SubscriptionsHeader } from '@/components/subscriptions/subscriptions-header'
import { SubscriptionsToolbar } from '@/components/subscriptions/subscriptions-toolbar'
import type { ViewMode } from '@/components/subscriptions/subscriptions-toolbar'
import { SORT_LABELS } from '@/components/subscriptions/subscriptions-sort'
import type { SortOption } from '@/components/subscriptions/subscriptions-sort'
import { CancelledSubscriptionsSection } from '@/components/subscriptions/cancelled-subscriptions-section'
import { useTagStore } from '@/stores/tag-store'
import { SubscriptionsSkeleton } from '@/components/subscriptions/subscriptions-skeleton'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import { calculateDisplayTotals, excludedCurrenciesNote } from '@/lib/totals'
import type { CurrencyCode } from '@/lib/currency'
import type { Tag } from '@/types/tag'
import {
  compareSubscriptionDisplayPriority,
  isBillableStatus,
  calculateNormalizedAmount,
} from '@/types/subscription'
import type { Subscription } from '@/types/subscription'

dayjs.extend(isSameOrBefore)

// Lazy load dialogs for better initial load performance. The subscription dialog itself is
// mounted once in the app shell.
const ConfirmDialog = lazy(() =>
  import('@/components/ui/confirm-dialog').then((m) => ({ default: m.ConfirmDialog }))
)
const CancelDialog = lazy(() =>
  import('@/components/subscriptions/cancel-dialog').then((m) => ({ default: m.CancelDialog }))
)

export function Subscriptions() {
  const {
    subscriptions,
    isLoading,
    error,
    remove,
    toggleActive,
    togglePinned,
    cancel,
    getCategory,
    refresh,
  } = useSubscriptions()
  const categories = useCategoryStore((state) => state.categories)
  const categoriesError = useCategoryStore((state) => state.error)
  const { openSubscriptionDialog, costNormalization } = useUiStore()
  const fetchSettings = useSettingsStore((state) => state.fetch)
  const settingsError = useSettingsStore((state) => state.error)
  const currency = useSettingsStore((state) => (state.settings?.currency || 'USD') as CurrencyCode)
  const { markAsPaid, fetchCalendarMonth } = usePaymentStore()
  const transitionStatus = useSubscriptionStore((state) => state.transitionStatus)

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem('kessai-view-mode')
      if (saved === 'grid' || saved === 'list' || saved === 'bento') return saved
    } catch {
      // ignore
    }
    return 'list'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const { tags: allTags, fetch: fetchTags, fetchForSubscriptions, error: tagsError } = useTagStore()
  const [subscriptionTagMap, setSubscriptionTagMap] = useState<Record<string, string[]>>({})
  const tagById = useMemo<Record<string, Tag>>(
    () => Object.fromEntries(allTags.map((tag) => [tag.id, tag])),
    [allTags]
  )
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem('kessai-sort-option')
      if (saved && saved in SORT_LABELS) return saved as SortOption
    } catch {
      // ignore
    }
    return 'date-asc'
  })
  // Targets outlive their dialogs so the names stay put during the close animation.
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  // Where focus goes when a confirmed delete or cancel closes its dialog: the first of these
  // rows still rendered, else the page heading. Unset when nothing changed, so focus returns
  // to the opener as usual.
  const focusAfterCloseRef = useRef<string[] | undefined>(undefined)
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const subscriptionIdsKey = useMemo(
    () => JSON.stringify(subscriptions.map((sub) => sub.id).sort()),
    [subscriptions]
  )

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Load tags for all subscriptions
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  useEffect(() => {
    if (!subscriptionIdsKey) {
      setSubscriptionTagMap({})
      return
    }
    let cancelled = false

    const loadTagMap = async () => {
      const map = await fetchForSubscriptions(JSON.parse(subscriptionIdsKey) as string[])
      if (cancelled) return
      setSubscriptionTagMap(map)
    }

    loadTagMap()
    return () => {
      cancelled = true
    }
  }, [subscriptionIdsKey, fetchForSubscriptions])

  useEffect(() => {
    try {
      localStorage.setItem('kessai-view-mode', viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  useEffect(() => {
    try {
      localStorage.setItem('kessai-sort-option', sortOption)
    } catch {
      // ignore
    }
  }, [sortOption])

  // Separate active and cancelled subscriptions
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((sub) => sub.status !== 'cancelled'),
    [subscriptions]
  )

  // Search, category, and tag filters apply to every list on the page, cancelled included.
  const matchesFilters = useCallback(
    (sub: Subscription) => {
      const matchesSearch = sub.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesCategory =
        selectedCategories.length === 0 ||
        (!!sub.category_id && selectedCategories.includes(sub.category_id))
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tagId) => (subscriptionTagMap[sub.id] || []).includes(tagId))
      return matchesSearch && matchesCategory && matchesTags
    },
    [searchQuery, selectedCategories, selectedTags, subscriptionTagMap]
  )

  // The toolbar (and so every filter control) only shows while something is active; filters
  // the user can no longer see or clear must not hide cancelled rows.
  const filtersShown = activeSubscriptions.length > 0
  const cancelledSubscriptions = useMemo(
    () =>
      subscriptions
        .filter((sub) => sub.status === 'cancelled' && (!filtersShown || matchesFilters(sub)))
        .sort((a, b) => {
          const dateA = a.cancelled_at ? new Date(a.cancelled_at).getTime() : 0
          const dateB = b.cancelled_at ? new Date(b.cancelled_at).getTime() : 0
          return dateB - dateA
        }),
    [subscriptions, filtersShown, matchesFilters]
  )

  // Calculate subscription counts per category
  const subscriptionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    activeSubscriptions.forEach((sub) => {
      if (sub.category_id) {
        counts[sub.category_id] = (counts[sub.category_id] || 0) + 1
      }
    })
    return counts
  }, [activeSubscriptions])

  const filteredSubscriptions = useMemo(() => {
    const filtered = activeSubscriptions.filter(matchesFilters)

    return filtered.sort((a, b) => {
      const priority = compareSubscriptionDisplayPriority(a, b)
      if (priority !== 0) return priority

      switch (sortOption) {
        case 'name-asc':
          return a.name.localeCompare(b.name)
        case 'name-desc':
          return b.name.localeCompare(a.name)
        case 'price-asc':
          return a.amount - b.amount
        case 'price-desc':
          return b.amount - a.amount
        case 'date-asc': {
          if (!a.next_payment_date && !b.next_payment_date) return 0
          if (!a.next_payment_date) return 1
          if (!b.next_payment_date) return -1
          return new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime()
        }
        case 'date-desc': {
          if (!a.next_payment_date && !b.next_payment_date) return 0
          if (!a.next_payment_date) return 1
          if (!b.next_payment_date) return -1
          return new Date(b.next_payment_date).getTime() - new Date(a.next_payment_date).getTime()
        }
        case 'category': {
          const catA = getCategory(a.category_id)?.name || ''
          const catB = getCategory(b.category_id)?.name || ''
          const cmp = catA.localeCompare(catB)
          if (cmp !== 0) return cmp
          return a.name.localeCompare(b.name)
        }
        default:
          return 0
      }
    })
  }, [activeSubscriptions, matchesFilters, sortOption, getCategory])

  const totals = useMemo(
    () => calculateDisplayTotals(subscriptions, currency),
    [subscriptions, currency]
  )
  const monthlySubsTotal = useMemo(
    () =>
      calculateDisplayTotals(
        subscriptions.filter((sub) => sub.billing_cycle === 'monthly'),
        currency
      ).monthly,
    [subscriptions, currency]
  )
  const yearlySubsTotal = useMemo(
    () =>
      calculateDisplayTotals(
        subscriptions.filter((sub) => sub.billing_cycle === 'yearly'),
        currency
      ).yearly,
    [subscriptions, currency]
  )
  const periodTotal =
    costNormalization === 'as-is'
      ? totals.monthly
      : calculateNormalizedAmount(totals.monthly, 'monthly', costNormalization)
  const currencyNote = excludedCurrenciesNote(totals.excludedCurrencies)

  const handleMarkAsPaid = async (sub: Subscription) => {
    if (!sub.next_payment_date) return
    try {
      const payment = await markAsPaid(sub.id, sub.next_payment_date, sub.amount)
      const dueDate = dayjs(payment.due_date)
      const [, calendarResult] = await Promise.allSettled([
        refresh(),
        fetchCalendarMonth(dueDate.year(), dueDate.month() + 1),
      ])
      const state = useSubscriptionStore.getState()
      const updated = state.error ? undefined : state.subscriptions.find((s) => s.id === sub.id)
      const nextPaymentDate = updated?.next_payment_date
      const scheduleAdvanced =
        payment.status === 'paid' && nextPaymentDate && nextPaymentDate !== sub.next_payment_date
      const outcome = payment.status === 'skipped' ? 'Payment skipped' : 'Payment recorded'
      const scheduleDescription = scheduleAdvanced
        ? ` Schedule advanced. Next payment: ${formatPaymentDate(nextPaymentDate)}.`
        : state.error
          ? ' The schedule could not be refreshed.'
          : ''
      const calendarDescription =
        calendarResult.status === 'rejected' ? ' The calendar could not be refreshed.' : ''
      toast.success(outcome, {
        description: `${sub.name}: payment ${payment.status}.${scheduleDescription}${calendarDescription}`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to record payment.' })
    }
    // Mark paid is gone once the payment is recorded; keep focus on the row (it may have moved).
    refocusIfLost(() => findSubscriptionFocus(sub.id) ?? pageHeading())
  }

  const canMarkAsPaid = (sub: Subscription): boolean => {
    if (!sub.next_payment_date || !isBillableStatus(sub.status)) return false
    const paymentDate = dayjs(sub.next_payment_date).startOf('day')
    const today = dayjs().startOf('day')
    return paymentDate.isSameOrBefore(today)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    // Read before the row unmounts: the row that takes its place gets focus.
    const neighbor = neighborSubscriptionId(deleteTarget.id)
    try {
      await remove(deleteTarget.id)
      focusAfterCloseRef.current = neighbor ? [neighbor] : []
      toast.success('Subscription deleted', {
        description: `${deleteTarget.name} has been removed.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to delete subscription.' })
    } finally {
      setIsDeleting(false)
      setDeleteOpen(false)
    }
  }

  const restoreFocusAfterClose = (event: Event) => {
    const candidates = focusAfterCloseRef.current
    if (!candidates) return
    focusAfterCloseRef.current = undefined
    event.preventDefault()
    const target = candidates.map((id) => findSubscriptionFocus(id)).find(Boolean) ?? pageHeading()
    target?.focus()
  }

  const handleTogglePinned = async (sub: Subscription) => {
    try {
      await togglePinned(sub.id)
      toast.success(sub.is_pinned ? 'Subscription unpinned' : 'Subscription pinned', {
        description: `${sub.name} has been ${sub.is_pinned ? 'unpinned' : 'pinned'}.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to toggle pin status.' })
    }
  }

  const handleCancel = async (id: string, reason?: string) => {
    setIsCancelling(true)
    // The row leaves the active list: its neighbor takes focus, else the row in Cancelled.
    const neighbor = neighborSubscriptionId(id)
    try {
      await cancel(id, reason)
      focusAfterCloseRef.current = neighbor ? [neighbor, id] : [id]
      const sub = cancelTarget
      toast.success('Subscription cancelled', {
        description: `${sub?.name ?? 'Subscription'} has been cancelled.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to cancel subscription.' })
    } finally {
      setIsCancelling(false)
      setCancelOpen(false)
    }
  }

  const handleToggleActive = async (sub: Subscription) => {
    try {
      await toggleActive(sub.id)
      toast.success(sub.is_active ? 'Subscription paused' : 'Subscription resumed', {
        description: `${sub.name} has been ${sub.is_active ? 'paused' : 'resumed'}.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to update subscription status.' })
    }
  }

  const handleReactivate = async (sub: Subscription) => {
    try {
      await transitionStatus(sub.id, 'active')
      const next = useSubscriptionStore
        .getState()
        .subscriptions.find((s) => s.id === sub.id)?.next_payment_date
      const hasPassed = Boolean(next) && dayjs(next).isBefore(dayjs(), 'day')
      toast.success(`Reactivated ${sub.name}`, {
        description: !next
          ? undefined
          : hasPassed
            ? `Its next payment date, ${formatPaymentDate(next)}, has passed. Edit it so reminders and totals stay right.`
            : `Next payment ${formatPaymentDate(next)}.`,
        action: hasPassed
          ? { label: 'Edit', onClick: () => openSubscriptionDialog(sub.id) }
          : undefined,
      })
    } catch (reactivateError) {
      toast.error(`Couldn't reactivate ${sub.name}`, {
        description:
          reactivateError instanceof Error
            ? reactivateError.message
            : 'Nothing changed. Try again.',
      })
    }
    // The row moves between the cancelled and active lists; focus follows it.
    refocusIfLost(() => findSubscriptionFocus(sub.id) ?? pageHeading())
  }

  const requestDelete = (sub: Subscription) => {
    setDeleteTarget(sub)
    setDeleteOpen(true)
  }

  const requestCancel = (sub: Subscription) => {
    setCancelTarget(sub)
    setCancelOpen(true)
  }

  const clearSearchAndFilters = () => {
    setSelectedCategories([])
    setSelectedTags([])
    setSearchQuery('')
  }

  // The store keeps its last good list when a later request fails, so only an empty list
  // with an error is a failed load. Everything else renders what we have.
  const loadFailed = Boolean(error) && subscriptions.length === 0
  const showSkeleton = isLoading && subscriptions.length === 0 && !loadFailed
  const isFirstRun = !showSkeleton && !loadFailed && subscriptions.length === 0
  // A search can miss every active subscription yet match cancelled ones: say so, and open them.
  const cancelledMatchOnly =
    activeSubscriptions.length > 0 &&
    filteredSubscriptions.length === 0 &&
    cancelledSubscriptions.length > 0

  const results = loadFailed ? (
    <EmptyState
      icon={AlertTriangle}
      tone="danger"
      title="Couldn’t load your subscriptions"
      description="Nothing was changed. Check that Kessai is running, then try again."
      action={
        <Button variant="outline" onClick={() => refresh()}>
          <RotateCw aria-hidden="true" />
          Retry
        </Button>
      }
    />
  ) : isFirstRun ? (
    <FirstRunEmptyState />
  ) : activeSubscriptions.length === 0 ? (
    <EmptyState
      icon={CreditCard}
      size="compact"
      title="No active subscriptions"
      description="Everything you track is cancelled; it’s listed below."
      action={
        <Button variant="outline" onClick={() => openSubscriptionDialog()}>
          <Plus aria-hidden="true" />
          Add Subscription
        </Button>
      }
    />
  ) : filteredSubscriptions.length === 0 ? (
    <EmptyState
      icon={Search}
      size="compact"
      title={
        cancelledMatchOnly
          ? searchQuery
            ? `No active subscriptions match “${searchQuery}”`
            : 'No active subscriptions match'
          : searchQuery
            ? `No subscriptions match “${searchQuery}”`
            : 'No subscriptions match'
      }
      description={
        cancelledMatchOnly
          ? cancelledSubscriptions.length === 1
            ? '1 cancelled subscription matches; it’s listed below.'
            : `${cancelledSubscriptions.length} cancelled subscriptions match; they’re listed below.`
          : 'Try another name, or clear the search and filters to see everything.'
      }
      action={
        <Button variant="outline" onClick={clearSearchAndFilters}>
          Clear search and filters
        </Button>
      }
    />
  ) : viewMode === 'bento' ? (
    <SubscriptionBento
      subscriptions={filteredSubscriptions}
      categories={categories}
      currency={currency}
      costNormalization={costNormalization}
      onEdit={(sub) => openSubscriptionDialog(sub.id)}
    />
  ) : viewMode === 'grid' ? (
    <SubscriptionsGridView
      subscriptions={filteredSubscriptions}
      currency={currency}
      costNormalization={costNormalization}
      getCategory={getCategory}
      onEdit={(sub) => openSubscriptionDialog(sub.id)}
      onDelete={requestDelete}
      onCancel={requestCancel}
      onToggleActive={handleToggleActive}
      onTogglePinned={handleTogglePinned}
      onMarkAsPaid={handleMarkAsPaid}
      canMarkAsPaid={canMarkAsPaid}
      tagById={tagById}
      subscriptionTagMap={subscriptionTagMap}
    />
  ) : (
    <SubscriptionsListView
      subscriptions={filteredSubscriptions}
      totalCount={activeSubscriptions.length}
      currency={currency}
      costNormalization={costNormalization}
      getCategory={getCategory}
      onEdit={(sub) => openSubscriptionDialog(sub.id)}
      onDelete={requestDelete}
      onCancel={requestCancel}
      onToggleActive={handleToggleActive}
      onTogglePinned={handleTogglePinned}
      onMarkAsPaid={handleMarkAsPaid}
      canMarkAsPaid={canMarkAsPaid}
      tagById={tagById}
      subscriptionTagMap={subscriptionTagMap}
    />
  )

  return (
    <>
      <div className="animate-fade-in-up flex h-full flex-col gap-6">
        <SubscriptionsHeader
          costNormalization={costNormalization}
          periodTotal={periodTotal}
          monthlySubsTotal={monthlySubsTotal}
          yearlySubsTotal={yearlySubsTotal}
          currency={currency}
          currencyNote={currencyNote}
          showTotals={!showSkeleton && !loadFailed}
          openSubscriptionDialog={() => openSubscriptionDialog()}
        />

        <WebBackendBanner error={error || settingsError || categoriesError || tagsError} />

        {showSkeleton ? (
          <SubscriptionsSkeleton viewMode={viewMode} />
        ) : (
          <>
            {filtersShown && (
              <SubscriptionsToolbar
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortOption={sortOption}
                setSortOption={setSortOption}
                viewMode={viewMode}
                setViewMode={setViewMode}
                categories={categories}
                selectedCategories={selectedCategories}
                setSelectedCategories={setSelectedCategories}
                selectedTags={selectedTags}
                setSelectedTags={setSelectedTags}
                subscriptionCounts={subscriptionCounts}
                subscriptionTagMap={subscriptionTagMap}
                resultCount={filteredSubscriptions.length}
              />
            )}

            {results}

            <CancelledSubscriptionsSection
              cancelledSubscriptions={cancelledSubscriptions}
              getCategory={getCategory}
              currency={currency}
              setDeleteTarget={requestDelete}
              onReactivate={handleReactivate}
              autoExpand={cancelledMatchOnly}
            />
          </>
        )}
      </div>

      <Suspense fallback={null}>
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Delete ${deleteTarget?.name ?? 'subscription'}?`}
          description={`This deletes ${deleteTarget?.name ?? 'the subscription'} and its payment history. This can’t be undone.`}
          confirmLabel="Delete subscription"
          variant="destructive"
          isLoading={isDeleting}
          onConfirm={handleDelete}
          onCloseAutoFocus={restoreFocusAfterClose}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CancelDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          subscription={cancelTarget}
          isLoading={isCancelling}
          onConfirm={handleCancel}
          onCloseAutoFocus={restoreFocusAfterClose}
        />
      </Suspense>
    </>
  )
}
