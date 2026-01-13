import { useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { SubscriptionForm } from './subscription-form'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useUiStore } from '@/stores/ui-store'
import type { SubscriptionFormData } from '@/types/subscription'

export function SubscriptionDialog() {
  const [isLoading, setIsLoading] = useState(false)

  const { subscriptions, add, update } = useSubscriptionStore()
  const { subscriptionDialogOpen, editingSubscriptionId, closeSubscriptionDialog } = useUiStore()

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
          color: data.color,
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
          color: data.color,
          logo_url: null,
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
    <Sheet
      open={subscriptionDialogOpen}
      onOpenChange={(open) => !open && closeSubscriptionDialog()}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">
            {isEditing ? 'Edit Subscription' : 'Add Subscription'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the details of your subscription below.'
              : 'Fill in the details to track a new subscription.'}
          </SheetDescription>
        </SheetHeader>

        <SubscriptionForm
          subscription={subscription}
          onSubmit={handleSubmit}
          onCancel={closeSubscriptionDialog}
          isLoading={isLoading}
        />
      </SheetContent>
    </Sheet>
  )
}
