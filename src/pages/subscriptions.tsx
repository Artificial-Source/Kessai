import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useSubscriptions } from '@/hooks/use-subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { formatCurrency } from '@/lib/currency'
import { formatPaymentDate, calculateNextPaymentDate } from '@/lib/date-utils'
import { parseISO, startOfDay } from 'date-fns'
import { BILLING_CYCLE_LABELS } from '@/types/subscription'
import { Plus, MoreVertical, Pencil, Trash2, Power, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SubscriptionDialog } from '@/components/subscriptions/subscription-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'

export function Subscriptions() {
  const { subscriptions, isLoading, remove, toggleActive, getCategory } = useSubscriptions()
  const { openSubscriptionDialog } = useUiStore()
  const { settings, fetch: fetchSettings } = useSettingsStore()
  const { markAsPaid } = usePaymentStore()
  const currency = (settings?.currency || 'USD') as CurrencyCode

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const [deleteTarget, setDeleteTarget] = useState<Subscription | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleMarkAsPaid = async (sub: Subscription) => {
    if (!sub.next_payment_date) return
    try {
      await markAsPaid(sub.id, sub.next_payment_date, sub.amount)

      const currentPaymentDate = parseISO(sub.next_payment_date)
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
      toast.error('Error', {
        description: 'Failed to record payment.',
      })
    }
  }

  const canMarkAsPaid = (sub: Subscription): boolean => {
    if (!sub.next_payment_date || !sub.is_active) return false
    const paymentDate = startOfDay(parseISO(sub.next_payment_date))
    const today = startOfDay(new Date())
    return paymentDate <= today
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await remove(deleteTarget.id)
      toast.success('Subscription deleted', {
        description: `${deleteTarget.name} has been removed from your subscriptions.`,
      })
    } catch {
      toast.error('Error', {
        description: 'Failed to delete subscription. Please try again.',
      })
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
      toast.error('Error', {
        description: 'Failed to update subscription status.',
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="border-aurora-purple h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Subscriptions</h1>
            <p className="text-muted-foreground">Manage your recurring payments</p>
          </div>
          <Button onClick={() => openSubscriptionDialog()} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Subscription
          </Button>
        </div>

        {subscriptions.length === 0 ? (
          <div className="glass-card flex flex-col items-center justify-center py-16">
            <div className="mb-4 rounded-full bg-white/5 p-4">
              <Plus className="text-muted-foreground h-8 w-8" />
            </div>
            <h2 className="mb-2 text-xl font-semibold">No subscriptions yet</h2>
            <p className="text-muted-foreground mb-6 text-center">
              Start tracking your recurring payments by adding your first subscription
            </p>
            <Button onClick={() => openSubscriptionDialog()}>Add your first subscription</Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {subscriptions.map((sub) => {
              const category = getCategory(sub.category_id)
              return (
                <div
                  key={sub.id}
                  className={`glass-card-hover p-5 transition-opacity ${!sub.is_active ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <SubscriptionLogo
                        logoUrl={sub.logo_url}
                        name={sub.name}
                        color={sub.color || category?.color}
                        size="lg"
                        className="rounded-xl"
                      />
                      <div>
                        <h3 className="font-semibold">{sub.name}</h3>
                        {category && (
                          <span
                            className="inline-block rounded-full px-2 py-0.5 text-xs"
                            style={{
                              backgroundColor: `${category.color}20`,
                              color: category.color,
                            }}
                          >
                            {category.name}
                          </span>
                        )}
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openSubscriptionDialog(sub.id)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleActive(sub)}>
                          <Power className="mr-2 h-4 w-4" />
                          {sub.is_active ? 'Pause' : 'Activate'}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(sub)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-baseline justify-between">
                      <span className="text-2xl font-bold">
                        {formatCurrency(sub.amount, currency)}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {BILLING_CYCLE_LABELS[sub.billing_cycle]}
                      </span>
                    </div>
                    {sub.next_payment_date && (
                      <div className="flex items-center justify-between">
                        <p className="text-muted-foreground text-sm">
                          Next: {formatPaymentDate(sub.next_payment_date)}
                        </p>
                        {canMarkAsPaid(sub) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkAsPaid(sub)}
                            className="h-7 gap-1 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20"
                          >
                            <Check className="h-3 w-3" />
                            Paid
                          </Button>
                        )}
                      </div>
                    )}
                    {!sub.is_active && (
                      <span className="bg-muted text-muted-foreground inline-block rounded-full px-2 py-0.5 text-xs">
                        Paused
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SubscriptionDialog />

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
    </>
  )
}
