import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import {
  Plus,
  Search,
  LayoutGrid,
  List,
  Grid3x3,
  ArrowUpDown,
  ChevronDown,
  Ban,
  Trash2,
} from 'lucide-react'
import { useSubscriptions } from '@/hooks/use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { formatCurrency } from '@/lib/currency'
import { convertCurrencyCached } from '@/lib/exchange-rates'
import { calculateNextPaymentDate, formatPaymentDate } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SubscriptionBento } from '@/components/subscriptions/subscription-bento'
import { SubscriptionsGridView } from '@/components/subscriptions/subscriptions-grid-view'
import { SubscriptionsListView } from '@/components/subscriptions/subscriptions-list-view'
import { CategoryFilter } from '@/components/subscriptions/category-filter'
import { CostNormalizationToggle } from '@/components/subscriptions/cost-normalization-toggle'
import { TagFilter } from '@/components/tags/tag-filter'
import { useTagStore } from '@/stores/tag-store'
import { SubscriptionsSkeleton } from '@/components/subscriptions/subscriptions-skeleton'
import type { CurrencyCode } from '@/lib/currency'
import {
  isBillableStatus,
  calculateNormalizedAmount,
  NORMALIZATION_SUFFIXES,
} from '@/types/subscription'
import type { Subscription } from '@/types/subscription'

type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'date-asc'
  | 'date-desc'
  | 'category'

const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name (A-Z)',
  'name-desc': 'Name (Z-A)',
  'price-asc': 'Price (Low-High)',
  'price-desc': 'Price (High-Low)',
  'date-asc': 'Next billing (Soonest)',
  'date-desc': 'Next billing (Latest)',
  category: 'Category',
}

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
  const { subscriptions, isLoading, remove, toggleActive, togglePinned, cancel, getCategory } =
    useSubscriptions()
  const categories = useCategoryStore((state) => state.categories)
  const { openSubscriptionDialog, costNormalization } = useUiStore()
  const { settings, fetch: fetchSettings } = useSettingsStore()
  const { markAsPaid } = usePaymentStore()
  const currency = (settings?.currency || 'USD') as CurrencyCode

  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'bento'>(() => {
    try {
      const saved = localStorage.getItem('subby-view-mode')
      if (saved === 'grid' || saved === 'list' || saved === 'bento') return saved
    } catch {
      // ignore
    }
    return 'list'
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const { tags: allTags, fetch: fetchTags, fetchForSubscription } = useTagStore()
  const [subscriptionTagMap, setSubscriptionTagMap] = useState<Record<string, string[]>>({})
  const [sortOption, setSortOption] = useState<SortOption>(() => {
    try {
      const saved = localStorage.getItem('subby-sort-option')
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
  const [showCancelled, setShowCancelled] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  // Load tags for all subscriptions
  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  useEffect(() => {
    if (subscriptions.length === 0) return
    let cancelled = false

    const loadTagMap = async () => {
      const map: Record<string, string[]> = {}
      for (const sub of subscriptions) {
        const tags = await fetchForSubscription(sub.id)
        if (cancelled) return
        map[sub.id] = tags.map((t) => t.id)
      }
      if (!cancelled) setSubscriptionTagMap(map)
    }

    loadTagMap()
    return () => {
      cancelled = true
    }
  }, [subscriptions, fetchForSubscription])

  useEffect(() => {
    try {
      localStorage.setItem('subby-view-mode', viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  useEffect(() => {
    try {
      localStorage.setItem('subby-sort-option', sortOption)
    } catch {
      // ignore
    }
  }, [sortOption])

  // Separate active and cancelled subscriptions
  const activeSubscriptions = useMemo(
    () => subscriptions.filter((sub) => sub.status !== 'cancelled'),
    [subscriptions]
  )

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
      // Pinned subscriptions always come first
      if (a.is_pinned && !b.is_pinned) return -1
      if (!a.is_pinned && b.is_pinned) return 1

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
      .filter((sub) => isBillableStatus(sub.status) && sub.billing_cycle === 'monthly')
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
      .filter((sub) => isBillableStatus(sub.status) && sub.billing_cycle === 'yearly')
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
      .filter((sub) => isBillableStatus(sub.status))
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
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">My Subscriptions</h1>
            <div className="flex flex-wrap items-center gap-3">
              {costNormalization !== 'as-is' && normalizedTotal !== null ? (
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                    Total:
                  </span>
                  <span className="bg-primary/10 text-primary rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                    {formatCurrency(normalizedTotal, currency)}
                    {NORMALIZATION_SUFFIXES[costNormalization]}
                  </span>
                </div>
              ) : (
                <>
                  {monthlySubsTotal > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                        Monthly:
                      </span>
                      <span className="bg-primary/10 text-primary rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                        {formatCurrency(monthlySubsTotal, currency)}/mo
                      </span>
                    </div>
                  )}
                  {yearlySubsTotal > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                        Yearly:
                      </span>
                      <span className="bg-accent-cyan/10 text-accent-cyan rounded px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] font-bold">
                        {formatCurrency(yearlySubsTotal, currency)}/yr
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <Button variant="glow" onClick={() => openSubscriptionDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Subscription
          </Button>
        </header>

        {activeSubscriptions.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-full sm:w-[280px]">
                  <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search subscriptions..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search subscriptions"
                    className="border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary h-10 w-full rounded-lg border pr-4 pl-10 font-[family-name:var(--font-sans)] text-sm focus:ring-1 focus:outline-none"
                  />
                </div>
                <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
                  <SelectTrigger className="h-10 w-full gap-2 rounded-lg font-[family-name:var(--font-mono)] text-[11px] tracking-wider sm:w-[200px]">
                    <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(
                      ([value, label]) => (
                        <SelectItem
                          key={value}
                          value={value}
                          className="font-[family-name:var(--font-mono)] text-[11px] tracking-wider"
                        >
                          {label}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
                <CostNormalizationToggle />
              </div>
              <div
                className="border-border flex rounded-lg border bg-[var(--color-surface-elevated)] p-1"
                role="group"
                aria-label="View mode"
              >
                <button
                  onClick={() => setViewMode('grid')}
                  aria-pressed={viewMode === 'grid'}
                  className={`flex h-7 w-8 items-center justify-center rounded-md ${
                    viewMode === 'grid'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="Grid view"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  aria-pressed={viewMode === 'list'}
                  className={`flex h-7 w-8 items-center justify-center rounded-md ${
                    viewMode === 'list'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setViewMode('bento')}
                  aria-pressed={viewMode === 'bento'}
                  className={`flex h-7 w-8 items-center justify-center rounded-md ${
                    viewMode === 'bento'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  aria-label="Bento view"
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <CategoryFilter
              categories={categories}
              selectedIds={selectedCategories}
              onChange={setSelectedCategories}
              subscriptionCounts={subscriptionCounts}
            />
            <TagFilter
              selectedTagIds={selectedTags}
              onChange={setSelectedTags}
              subscriptionTagMap={subscriptionTagMap}
            />
          </div>
        )}

        {activeSubscriptions.length === 0 && cancelledSubscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-[var(--color-border-hover)] bg-[var(--color-card)] py-16 backdrop-blur-xl">
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
            allTags={allTags}
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
            onDelete={setDeleteTarget}
            onCancel={setCancelTarget}
            onToggleActive={handleToggleActive}
            onTogglePinned={handleTogglePinned}
            allTags={allTags}
            subscriptionTagMap={subscriptionTagMap}
          />
        )}

        {/* Cancelled subscriptions section */}
        {cancelledSubscriptions.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowCancelled((prev) => !prev)}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2 py-2 transition-colors"
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${showCancelled ? 'rotate-0' : '-rotate-90'}`}
              />
              <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase">
                Cancelled ({cancelledSubscriptions.length})
              </span>
            </button>
            {showCancelled && (
              <div className="animate-fade-in-up mt-2 space-y-2">
                {cancelledSubscriptions.map((sub) => {
                  const category = getCategory(sub.category_id)
                  return (
                    <div
                      key={sub.id}
                      className="glass-card flex items-center justify-between gap-4 rounded-xl px-4 py-3 opacity-60"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <Ban className="text-destructive h-4 w-4 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-foreground truncate text-sm font-medium">{sub.name}</p>
                          <div className="text-muted-foreground flex items-center gap-2 font-[family-name:var(--font-mono)] text-[10px]">
                            {sub.cancelled_at && (
                              <span>Cancelled {dayjs(sub.cancelled_at).format('MMM D, YYYY')}</span>
                            )}
                            {sub.cancellation_reason && (
                              <>
                                <span className="text-border">|</span>
                                <span className="truncate" title={sub.cancellation_reason}>
                                  {sub.cancellation_reason}
                                </span>
                              </>
                            )}
                            {category && (
                              <>
                                <span className="text-border">|</span>
                                <span>{category.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                          {formatCurrency(sub.amount, (sub.currency || currency) as CurrencyCode)}
                        </span>
                        <button
                          onClick={() => setDeleteTarget(sub)}
                          aria-label={`Delete ${sub.name}`}
                          className="text-muted-foreground hover:bg-destructive/15 hover:text-destructive rounded-lg p-1.5 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
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
