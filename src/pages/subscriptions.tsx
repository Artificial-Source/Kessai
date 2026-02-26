import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore'
import { Plus, Search, LayoutGrid, List, Grid3x3 } from 'lucide-react'
import { useSubscriptions } from '@/hooks/use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { formatCurrency } from '@/lib/currency'
import { calculateNextPaymentDate, formatPaymentDate } from '@/lib/date-utils'
import { Button } from '@/components/ui/button'
import { SubscriptionBento } from '@/components/subscriptions/subscription-bento'
import { SubscriptionsGridView } from '@/components/subscriptions/subscriptions-grid-view'
import { SubscriptionsListView } from '@/components/subscriptions/subscriptions-list-view'
import { CategoryFilter } from '@/components/subscriptions/category-filter'
import type { CurrencyCode } from '@/lib/currency'
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

export function Subscriptions() {
  const { subscriptions, isLoading, remove, toggleActive, getCategory } = useSubscriptions()
  const categories = useCategoryStore((state) => state.categories)
  const { openSubscriptionDialog } = useUiStore()
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
  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  useEffect(() => {
    try {
      localStorage.setItem('subby-view-mode', viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  // Calculate subscription counts per category
  const subscriptionCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    subscriptions.forEach((sub) => {
      if (sub.category_id) {
        counts[sub.category_id] = (counts[sub.category_id] || 0) + 1
      }
    })
    return counts
  }, [subscriptions])

  const filteredSubscriptions = subscriptions.filter((sub) => {
    const matchesSearch = sub.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory =
      selectedCategories.length === 0 ||
      (sub.category_id && selectedCategories.includes(sub.category_id))
    return matchesSearch && matchesCategory
  })

  // Separate totals by billing cycle
  const monthlySubsTotal = useMemo(() => {
    return subscriptions
      .filter((sub) => sub.is_active && sub.billing_cycle === 'monthly')
      .reduce((total, sub) => total + sub.amount, 0)
  }, [subscriptions])

  const yearlySubsTotal = useMemo(() => {
    return subscriptions
      .filter((sub) => sub.is_active && sub.billing_cycle === 'yearly')
      .reduce((total, sub) => total + sub.amount, 0)
  }, [subscriptions])

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
    if (!sub.next_payment_date || !sub.is_active) return false
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
    return (
      <div className="flex h-full items-center justify-center">
        <div
          role="status"
          aria-label="Loading subscriptions"
          className="border-primary h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
        />
      </div>
    )
  }

  return (
    <>
      <div className="flex h-full flex-col gap-8">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-foreground font-[family-name:var(--font-heading)] text-4xl font-bold tracking-tight">
              My Subscriptions
            </h1>
            <div className="flex flex-wrap items-center gap-3">
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
            </div>
          </div>
          <Button variant="glow" onClick={() => openSubscriptionDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Subscription
          </Button>
        </header>

        {subscriptions.length > 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative w-[360px] max-w-full">
                <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search subscriptions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary h-10 w-full rounded-lg border pr-4 pl-10 font-[family-name:var(--font-sans)] text-sm focus:ring-1 focus:outline-none"
                />
              </div>
              <div
                className="border-border flex rounded-lg border bg-[#111111] p-1"
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
          </div>
        )}

        {subscriptions.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-16">
            <div className="bg-primary/10 mb-4 rounded-full p-4">
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
            {selectedCategories.length > 0 && (
              <button
                onClick={() => setSelectedCategories([])}
                className="text-primary mt-2 text-sm hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : viewMode === 'bento' ? (
          <SubscriptionBento
            subscriptions={filteredSubscriptions}
            categories={categories}
            currency={currency}
            onEdit={(sub) => openSubscriptionDialog(sub.id)}
          />
        ) : viewMode === 'grid' ? (
          <SubscriptionsGridView
            subscriptions={filteredSubscriptions}
            currency={currency}
            getCategory={getCategory}
            onEdit={(sub) => openSubscriptionDialog(sub.id)}
            onDelete={setDeleteTarget}
            onToggleActive={handleToggleActive}
            onMarkAsPaid={handleMarkAsPaid}
            canMarkAsPaid={canMarkAsPaid}
          />
        ) : (
          <SubscriptionsListView
            subscriptions={filteredSubscriptions}
            totalCount={subscriptions.length}
            currency={currency}
            getCategory={getCategory}
            onEdit={(sub) => openSubscriptionDialog(sub.id)}
            onDelete={setDeleteTarget}
            onToggleActive={handleToggleActive}
          />
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
    </>
  )
}
