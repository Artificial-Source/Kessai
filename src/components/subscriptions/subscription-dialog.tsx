import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { ArrowLeft } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { SubscriptionForm } from './subscription-form'
import { TemplatePicker } from './template-picker'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useTagStore } from '@/stores/tag-store'
import { useUiStore } from '@/stores/ui-store'
import type { SubscriptionFormData } from '@/types/subscription'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

type DialogPhase = 'picker' | 'form'

export function SubscriptionDialog() {
  const [isLoading, setIsLoading] = useState(false)
  const [phase, setPhase] = useState<DialogPhase>('picker')
  const [selectedTemplate, setSelectedTemplate] = useState<SubscriptionTemplate | null>(null)

  const { subscriptions, add, update } = useSubscriptionStore(
    useShallow((state) => ({
      subscriptions: state.subscriptions,
      add: state.add,
      update: state.update,
    }))
  )
  const categories = useCategoryStore((state) => state.categories)
  const { addToSubscription, removeFromSubscription, fetchForSubscription } = useTagStore(
    useShallow((state) => ({
      addToSubscription: state.addToSubscription,
      removeFromSubscription: state.removeFromSubscription,
      fetchForSubscription: state.fetchForSubscription,
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

  const handleClose = useCallback(() => {
    closeSubscriptionDialog()
    // Reset phase after dialog closes
    setTimeout(() => {
      setPhase('picker')
      setSelectedTemplate(null)
    }, 200)
  }, [closeSubscriptionDialog])

  const handleSelectTemplate = useCallback(
    (template: SubscriptionTemplate) => {
      // Match template category to existing categories by name
      const matchedCategory = categories.find(
        (c) => c.name.toLowerCase() === template.category.toLowerCase()
      )
      setSelectedTemplate({ ...template, category: matchedCategory?.id || template.category })
      setPhase('form')
    },
    [categories]
  )

  const handleStartFromScratch = useCallback(() => {
    setSelectedTemplate(null)
    setPhase('form')
  }, [])

  const handleBackToPicker = useCallback(() => {
    setSelectedTemplate(null)
    setPhase('picker')
  }, [])

  const syncTags = async (subId: string, newTagIds: string[]) => {
    // Get current tags for this subscription
    const currentTags = await fetchForSubscription(subId)
    const currentTagIds = currentTags.map((t) => t.id)

    // Remove tags that were deselected
    for (const tagId of currentTagIds) {
      if (!newTagIds.includes(tagId)) {
        await removeFromSubscription(subId, tagId)
      }
    }

    // Add tags that were newly selected
    for (const tagId of newTagIds) {
      if (!currentTagIds.includes(tagId)) {
        await addToSubscription(subId, tagId)
      }
    }
  }

  const handleSubmit = async (data: SubscriptionFormData, tagIds?: string[]) => {
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
          status: data.is_trial ? 'trial' : undefined,
          trial_end_date: data.is_trial ? (data.trial_end_date ?? null) : null,
          shared_count: data.shared_count,
        })

        if (tagIds) {
          await syncTags(editingSubscriptionId, tagIds)
        }

        toast.success('Subscription updated', {
          description: `${data.name} has been updated successfully.`,
        })
      } else {
        const created = await add({
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
          status: data.is_trial ? 'trial' : 'active',
          trial_end_date: data.is_trial ? (data.trial_end_date ?? null) : null,
          shared_count: data.shared_count,
        })

        if (tagIds && tagIds.length > 0 && created) {
          for (const tagId of tagIds) {
            await addToSubscription(created.id, tagId)
          }
        }

        toast.success('Subscription added', {
          description: `${data.name} has been added to your subscriptions.`,
        })
      }
      handleClose()
    } catch (error) {
      toast.error('Error', {
        description: `Failed to ${isEditing ? 'update' : 'add'} subscription. Please try again.`,
      })
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  // Editing always goes straight to form
  const showPicker = !isEditing && phase === 'picker'

  return (
    <Dialog open={subscriptionDialogOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          {!isEditing && phase === 'form' && (
            <button
              onClick={handleBackToPicker}
              className="text-muted-foreground hover:text-foreground mb-1 flex w-fit items-center gap-1 text-sm transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to templates
            </button>
          )}
          <DialogTitle className="text-xl">
            {isEditing
              ? 'Edit Subscription'
              : showPicker
                ? 'Add Subscription'
                : selectedTemplate
                  ? `Add ${selectedTemplate.name}`
                  : 'Add Subscription'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your subscription below.'
              : showPicker
                ? 'Choose a service or start from scratch.'
                : 'Fill in the details to track a new subscription.'}
          </DialogDescription>
        </DialogHeader>

        {showPicker ? (
          <TemplatePicker
            onSelect={handleSelectTemplate}
            onStartFromScratch={handleStartFromScratch}
          />
        ) : (
          <div className="flex-1 overflow-y-auto overscroll-contain pr-1">
            <SubscriptionForm
              key={editingSubscriptionId || selectedTemplate?.id || 'new'}
              subscription={subscription}
              template={selectedTemplate}
              onSubmit={handleSubmit}
              onCancel={handleClose}
              isLoading={isLoading}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
