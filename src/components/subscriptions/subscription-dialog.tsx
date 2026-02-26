import { useState } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SubscriptionForm } from './subscription-form'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useUiStore } from '@/stores/ui-store'
import type { SubscriptionFormData } from '@/types/subscription'

export function SubscriptionDialog() {
  const [isLoading, setIsLoading] = useState(false)

  // Use selective subscriptions for better performance
  const { subscriptions, add, update } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      add: state.add,
      update: state.update,
    }))
  )
  const { subscriptionDialogOpen, editingSubscriptionId, closeSubscriptionDialog } = useUiStore(
    useShallow((state) => ({
      subscriptionDialogOpen: state.subscriptionDialogOpen,
      editingSubscriptionId: state.editingSubscriptionId,
      closeSubscriptionDialog: state.closeSubscriptionDialog,
    }))
  )

  const subscription = editingSubscriptionId
    ? subscriptions.find((s) => s.id === editingSubscriptionId)
    : null

  const isEditing = Boolean(editingSubscriptionId)

  const handleSubmit = async (data: SubscriptionFormData) => {
    setIsLoading(true)
    try {
      if (isEditing && editingSubscriptionId) {
        await update(editingSubscriptionId, {
          name: data.name,
          amount: data.amount,
          currency: data.currency,
          billing_cycle: data.billing_cycle,
          billing_day: data.billing_day,
          category_id: data.category_id,
          card_id: data.card_id ?? null,
          color: data.color,
          logo_url: data.logo_url ?? null,
          notes: data.notes,
          next_payment_date: data.next_payment_date,
        })
        toast.success('Subscription updated', {
          description: `${data.name} has been updated successfully.`,
        })
      } else {
        await add({
          name: data.name,
          amount: data.amount,
          currency: data.currency,
          billing_cycle: data.billing_cycle,
          billing_day: data.billing_day,
          category_id: data.category_id,
          card_id: data.card_id ?? null,
          color: data.color,
          logo_url: data.logo_url ?? null,
          notes: data.notes,
          is_active: true,
          next_payment_date: data.next_payment_date,
        })
        toast.success('Subscription added', {
          description: `${data.name} has been added to your subscriptions.`,
        })
      }
      closeSubscriptionDialog()
    } catch (error) {
      toast.error('Error', {
        description: `Failed to ${isEditing ? 'update' : 'add'} subscription. Please try again.`,
      })
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog
      open={subscriptionDialogOpen}
      onOpenChange={(open) => !open && closeSubscriptionDialog()}
    >
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isEditing ? 'Edit Subscription' : 'Add Subscription'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your subscription below.'
              : 'Fill in the details to track a new subscription.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain pr-1">
          <SubscriptionForm
            key={editingSubscriptionId || 'new'}
            subscription={subscription}
            onSubmit={handleSubmit}
            onCancel={closeSubscriptionDialog}
            isLoading={isLoading}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
