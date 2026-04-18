import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { Plus, Search } from 'lucide-react'
import { useSubscriptions } from '@/hooks/use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import { calculateNextPaymentDate, formatPaymentDate } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import { SubscriptionBento } from '@/components/subscriptions/subscription-bento'
import { SubscriptionsGridView } from '@/components/subscriptions/subscriptions-grid-view'
import { SubscriptionsListView } from '@/components/subscriptions/subscriptions-list-view'
import { SubscriptionsHeader } from '@/components/subscriptions/subscriptions-header'
import { SubscriptionsToolbar } from '@/components/subscriptions/subscriptions-toolbar'
import { SORT_LABELS } from '@/components/subscriptions/subscriptions-sort'
import type { SortOption } from '@/components/subscriptions/subscriptions-sort'
import { CancelledSubscriptionsSection } from '@/components/subscriptions/cancelled-subscriptions-section'
import { useTagStore } from '@/stores/tag-store'
import { usePriceHistoryStore } from '@/stores/price-history-store'
import { SubscriptionsSkeleton } from '@/components/subscriptions/subscriptions-skeleton'
import { WebBackendBanner } from '@/components/ui/web-backend-banner'
import type { CurrencyCode } from '@/lib/currency'
import type { Tag } from '@/types/tag'
import {
  compareSubscriptionDisplayPriority,
  isBillableStatus,
  calculateNormalizedAmount,
} from '@/types/subscription'
import type { Subscription } from '@/types/subscription'

dayjs.extend(isSameOrBefore)

// Lazy load dialogs for better initial load performance
const SubscriptionDialog = lazy(() =>
  import('@/components/subscriptions/subscription-dialog').then((m) => ({
    default: m.SubscriptionDialog,
  }))
)
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
  } = useSubscriptions()
  const categories = useCategoryStore((state) => state.categories)
  const categoriesError = useCategoryStore((state) => state.error)
  const { openSubscriptionDialog, costNormalization } = useUiStore()
  const fetchSettings = useSettingsStore((state) => state.fetch)
  const settingsError = useSettingsStore((state) => state.error)
  const currency = useSettingsStore((state) => (state.settings?.currency || 'USD') as CurrencyCode)
  const { markAsPaid } = usePaymentStore()

  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'bento'>(() => {
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
  const { latestBySubscription, fetchLatestForSubscriptions } = usePriceHistoryStore(
    useShallow((state) => ({
      latestBySubscription: state.latestBySubscription,
      fetchLatestForSubscriptions: state.fetchLatestForSubscriptions,
    }))
  )
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
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<Subscription | null>(null)
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
  const activeSubscriptionIdsKey = useMemo(
    () => JSON.stringify(activeSubscriptions.map((sub) => sub.id).sort()),
    [activeSubscriptions]
  )

  useEffect(() => {
    if (!activeSubscriptionIdsKey) return
    void fetchLatestForSubscriptions(JSON.parse(activeSubscriptionIdsKey) as string[])
  }, [activeSubscriptionIdsKey, fetchLatestForSubscriptions])

  const cancelledSubscriptions = useMemo(
    () =>
      subscriptions
        .filter((sub) => sub.status === 'cancelled')
        .sort((a, b) => {
          const dateA = a.cancelled_at ? new Date(a.cancelled_at).getTime() : 0
          const dateB = b.cancelled_at ? new Date(b.cancelled_at).getTime() : 0
          return dateB - dateA
        }),
    [subscriptions]
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
    const query = searchQuery.toLowerCase()
    const filtered = activeSubscriptions.filter((sub) => {
      const matchesSearch = sub.name.toLowerCase().includes(query)
      const matchesCategory =
        selectedCategories.length === 0 ||
        (sub.category_id && selectedCategories.includes(sub.category_id))
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tagId) => (subscriptionTagMap[sub.id] || []).includes(tagId))
      return matchesSearch && matchesCategory && matchesTags
    })

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
  }, [
    activeSubscriptions,
    searchQuery,
    selectedCategories,
    selectedTags,
    subscriptionTagMap,
    sortOption,
    getCategory,
  ])

  // Separate totals by billing cycle (converted to display currency)
  const monthlySubsTotal = useMemo(() => {
    return subscriptions
      .filter(
        (sub) => sub.is_active && isBillableStatus(sub.status) && sub.billing_cycle === 'monthly'
      )
      .reduce((total, sub) => {
        const amount = sub.amount / Math.max(sub.shared_count, 1)
        const subCurrency = (sub.currency || currency) as CurrencyCode
        if (subCurrency === currency) return total + amount
        const converted = convertCurrencyCached(amount, subCurrency, currency)
        return total + (converted ?? amount)
      }, 0)
  }, [subscriptions, currency])

  const yearlySubsTotal = useMemo(() => {
    return subscriptions
      .filter(
        (sub) => sub.is_active && isBillableStatus(sub.status) && sub.billing_cycle === 'yearly'
      )
      .reduce((total, sub) => {
        const amount = sub.amount / Math.max(sub.shared_count, 1)
        const subCurrency = (sub.currency || currency) as CurrencyCode
        if (subCurrency === currency) return total + amount
        const converted = convertCurrencyCached(amount, subCurrency, currency)
        return total + (converted ?? amount)
      }, 0)
  }, [subscriptions, currency])

  // Normalized total across all billable subscriptions
  const normalizedTotal = useMemo(() => {
    if (costNormalization === 'as-is') return null
    return subscriptions
      .filter((sub) => sub.is_active && isBillableStatus(sub.status))
      .reduce((total, sub) => {
        const amount = sub.amount / Math.max(sub.shared_count, 1)
        const subCurrency = (sub.currency || currency) as CurrencyCode
        const convertedAmount =
          subCurrency === currency
            ? amount
            : (convertCurrencyCached(amount, subCurrency, currency) ?? amount)
        return (
          total + calculateNormalizedAmount(convertedAmount, sub.billing_cycle, costNormalization)
        )
      }, 0)
  }, [subscriptions, currency, costNormalization])

  const handleMarkAsPaid = async (sub: Subscription) => {
    if (!sub.next_payment_date) return
    try {
      await markAsPaid(sub.id, sub.next_payment_date, sub.amount)
      const currentPaymentDate = dayjs(sub.next_payment_date).toDate()
      const nextDate = calculateNextPaymentDate(
        currentPaymentDate,
        sub.billing_cycle,
        sub.billing_day || undefined
      )
      await useSubscriptionStore.getState().update(sub.id, {
        next_payment_date: nextDate.toISOString().split('T')[0],
      })
      toast.success('Payment recorded', {
        description: `${sub.name} marked as paid. Next payment: ${formatPaymentDate(nextDate)}`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to record payment.' })
    }
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
    try {
      await remove(deleteTarget.id)
      toast.success('Subscription deleted', {
        description: `${deleteTarget.name} has been removed.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to delete subscription.' })
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
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
    try {
      await cancel(id, reason)
      const sub = cancelTarget
      toast.success('Subscription cancelled', {
        description: `${sub?.name ?? 'Subscription'} has been cancelled.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to cancel subscription.' })
    } finally {
      setIsCancelling(false)
      setCancelTarget(null)
    }
  }

  const handleToggleActive = async (sub: Subscription) => {
    try {
      await toggleActive(sub.id)
      toast.success(sub.is_active ? 'Subscription paused' : 'Subscription activated', {
        description: `${sub.name} has been ${sub.is_active ? 'paused' : 'activated'}.`,
      })
    } catch {
      toast.error('Error', { description: 'Failed to update subscription status.' })
    }
  }

  if (isLoading) {
    return <SubscriptionsSkeleton />
  }

  return (
    <>
      <div className="animate-fade-in-up flex h-full flex-col space-y-6">
        <SubscriptionsHeader
          costNormalization={costNormalization}
          normalizedTotal={normalizedTotal}
          monthlySubsTotal={monthlySubsTotal}
          yearlySubsTotal={yearlySubsTotal}
          currency={currency}
          openSubscriptionDialog={() => openSubscriptionDialog()}
        />

        <WebBackendBanner error={error || settingsError || categoriesError || tagsError} />

        {activeSubscriptions.length > 0 && (
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
          />
        )}

        {activeSubscriptions.length === 0 && cancelledSubscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border-hover)] bg-[var(--color-card)] py-16">
            <div className="bg-primary/10 animate-gentle-float mb-4 rounded-full p-4">
              <Plus className="text-primary h-8 w-8" />
            </div>
            <h2 className="text-foreground mb-2 text-xl font-semibold">No subscriptions yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm text-center">
              Start tracking your recurring payments by adding your first subscription
            </p>
            <Button variant="glow" onClick={() => openSubscriptionDialog()}>
              Add your first subscription
            </Button>
          </div>
        ) : filteredSubscriptions.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-16">
            <Search className="text-muted-foreground mb-4 h-12 w-12" />
            <p className="text-muted-foreground">
              No subscriptions match {searchQuery ? `"${searchQuery}"` : 'your filters'}
            </p>
            {(selectedCategories.length > 0 || selectedTags.length > 0 || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedCategories([])
                  setSelectedTags([])
                  setSearchQuery('')
                }}
                className="text-primary mt-2 text-sm hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
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
            onDelete={setDeleteTarget}
            onCancel={setCancelTarget}
            onToggleActive={handleToggleActive}
            onTogglePinned={handleTogglePinned}
            onMarkAsPaid={handleMarkAsPaid}
            canMarkAsPaid={canMarkAsPaid}
            tagById={tagById}
            subscriptionTagMap={subscriptionTagMap}
            latestPriceChangeMap={latestBySubscription}
          />
        ) : (
          <SubscriptionsListView
            subscriptions={filteredSubscriptions}
            totalCount={activeSubscriptions.length}
            currency={currency}
            costNormalization={costNormalization}
            getCategory={getCategory}
            onEdit={(sub) => openSubscriptionDialog(sub.id)}
            onDelete={setDeleteTarget}
            onCancel={setCancelTarget}
            onToggleActive={handleToggleActive}
            onTogglePinned={handleTogglePinned}
            tagById={tagById}
            subscriptionTagMap={subscriptionTagMap}
            latestPriceChangeMap={latestBySubscription}
          />
        )}

        <CancelledSubscriptionsSection
          cancelledSubscriptions={cancelledSubscriptions}
          getCategory={getCategory}
          currency={currency}
          setDeleteTarget={setDeleteTarget}
        />
      </div>

      <Suspense fallback={null}>
        <SubscriptionDialog />
      </Suspense>

      <Suspense fallback={null}>
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Delete Subscription"
          description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          variant="destructive"
          isLoading={isDeleting}
          onConfirm={handleDelete}
        />
      </Suspense>

      <Suspense fallback={null}>
        <CancelDialog
          open={Boolean(cancelTarget)}
          onOpenChange={(open) => !open && setCancelTarget(null)}
          subscription={cancelTarget}
          isLoading={isCancelling}
          onConfirm={handleCancel}
        />
      </Suspense>
    </>
  )
}
