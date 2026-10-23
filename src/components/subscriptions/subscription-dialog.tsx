import { useState, useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useShallow } from 'zustand/react/shallow'
import { AlertTriangle, ArrowLeft, RotateCw, SearchX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
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

/** A subscription write that committed while its tag links did not. */
type PendingTagSync = {
  subscriptionId: string
  subscriptionName: string
  tagIds: string[]
}

/** Lets every tag write settle before reporting the first failure, so a retry never races one. */
async function settleTagWrites(writes: Promise<void>[]) {
  const results = await Promise.allSettled(writes)
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected'
  )
  if (failure) throw failure.reason
}

export function SubscriptionDialog() {
  const { subscriptionDialogOpen, editingSubscriptionId, closeSubscriptionDialog } = useUiStore(
    useShallow((state) => ({
      subscriptionDialogOpen: state.subscriptionDialogOpen,
      editingSubscriptionId: state.editingSubscriptionId,
      closeSubscriptionDialog: state.closeSubscriptionDialog,
    }))
  )

  return (
    <Dialog
      open={subscriptionDialogOpen}
      onOpenChange={(open) => !open && closeSubscriptionDialog()}
    >
      {/* A flex column: header and footer stay put while the form or template list scrolls. */}
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        {/* The editor unmounts whenever the dialog closes (by any path) and remounts per target,
            so a draft or a pending tag retry can never leak into the next session. */}
        <SubscriptionEditor
          key={editingSubscriptionId ?? 'new'}
          editingSubscriptionId={editingSubscriptionId}
          onClose={closeSubscriptionDialog}
        />
      </DialogContent>
    </Dialog>
  )
}

type SubscriptionEditorProps = {
  editingSubscriptionId: string | null
  onClose: () => void
}

function SubscriptionEditor({ editingSubscriptionId, onClose }: SubscriptionEditorProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [phase, setPhase] = useState<DialogPhase>('picker')
  const [selectedTemplate, setSelectedTemplate] = useState<SubscriptionTemplate | null>(null)
  const [pendingTagSync, setPendingTagSync] = useState<PendingTagSync | null>(null)
  const [isRetryingTags, setIsRetryingTags] = useState(false)
  // State lands a render late; this blocks a second save or retry dispatched before it does.
  const writeInFlightRef = useRef(false)
  // Writes can settle after the dialog closed; they must not close or mutate a later session.
  const isMountedRef = useRef(false)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const { subscriptions, subscriptionsError, fetchSubscriptions, add, update } =
    useSubscriptionStore(
      useShallow((state) => ({
        subscriptions: state.subscriptions,
        subscriptionsError: state.error,
        fetchSubscriptions: state.fetch,
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

  const subscription = editingSubscriptionId
    ? subscriptions.find((s) => s.id === editingSubscriptionId)
    : null

  const isEditing = Boolean(editingSubscriptionId)
  // The dialog opens from any route (N, the palette, the calendar), including ones that have
  // not loaded the subscription list yet. Look it up rather than edit a blank draft.
  const isMissing = isEditing && !subscription
  const [lookup, setLookup] = useState({ attempt: 0, settled: 0 })
  useEffect(() => {
    if (!isMissing) return
    let live = true
    void fetchSubscriptions().finally(() => {
      if (live) setLookup((prev) => ({ ...prev, settled: prev.attempt + 1 }))
    })
    return () => {
      live = false
    }
  }, [isMissing, fetchSubscriptions, lookup.attempt])
  const isLookingUp = isMissing && lookup.settled <= lookup.attempt

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
    const tagsToRemove = currentTagIds.filter((tagId) => !newTagIds.includes(tagId))
    const tagsToAdd = newTagIds.filter((tagId) => !currentTagIds.includes(tagId))

    await settleTagWrites([
      ...tagsToRemove.map((tagId) => removeFromSubscription(subId, tagId)),
      ...tagsToAdd.map((tagId) => addToSubscription(subId, tagId)),
    ])
  }

  const handleSubmit = async (data: SubscriptionFormData, tagIds?: string[]) => {
    // Once the subscription is committed only its tags may be retried; never write it twice.
    if (pendingTagSync || writeInFlightRef.current) return
    writeInFlightRef.current = true
    setIsSaving(true)
    let savedId: string | null = null
    try {
      if (isEditing && editingSubscriptionId) {
        // The form has no billing-day control, so the edit never sends one. The date goes out
        // only when it changed: core treats a patched date as the new anchor and drops the
        // stored billing day, which an untouched date must not do.
        const storedNextDate = subscription?.next_payment_date?.split('T')[0] ?? null
        await update(editingSubscriptionId, {
          name: data.name,
          amount: data.amount,
          currency: data.currency,
          billing_cycle: data.billing_cycle,
          category_id: data.category_id,
          card_id: data.card_id ?? null,
          color: data.color,
          logo_url: data.logo_url ?? null,
          notes: data.notes,
          ...(data.next_payment_date !== storedNextDate && {
            next_payment_date: data.next_payment_date,
          }),
          // Turning a trial off is a transition to active, not "leave the status unchanged".
          status: data.is_trial ? 'trial' : subscription?.status === 'trial' ? 'active' : undefined,
          trial_end_date: data.is_trial ? (data.trial_end_date ?? null) : null,
          shared_count: data.shared_count,
          is_pinned: data.is_pinned,
        })
        savedId = editingSubscriptionId

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
          is_pinned: data.is_pinned,
        })
        savedId = created.id

        if (tagIds && tagIds.length > 0) {
          await settleTagWrites(tagIds.map((tagId) => addToSubscription(created.id, tagId)))
        }

        toast.success('Subscription added', {
          description: `${data.name} has been added to your subscriptions.`,
        })
      }
      if (isMountedRef.current) onClose()
    } catch (error) {
      console.error(error)
      if (savedId === null) {
        toast.error('Error', {
          description: `Failed to ${isEditing ? 'update' : 'add'} subscription. Please try again.`,
        })
      } else if (isMountedRef.current) {
        setPendingTagSync({
          subscriptionId: savedId,
          subscriptionName: data.name,
          tagIds: tagIds ?? [],
        })
      } else {
        toast.error('Subscription saved; tags failed', {
          description: `${data.name} was saved without its tag changes. Edit it to apply them.`,
        })
      }
    } finally {
      writeInFlightRef.current = false
      setIsSaving(false)
    }
  }

  const handleRetryTags = async () => {
    if (!pendingTagSync || writeInFlightRef.current) return
    writeInFlightRef.current = true
    setIsRetryingTags(true)
    const { subscriptionId, subscriptionName, tagIds } = pendingTagSync
    try {
      // Re-read the links: the failed attempt may have applied some of them.
      await syncTags(subscriptionId, tagIds)
      toast.success('Tags saved', {
        description: `${subscriptionName} is saved with its tags.`,
      })
      if (isMountedRef.current) onClose()
    } catch (error) {
      console.error(error)
      toast.error('Tags still not saved', {
        description: isMountedRef.current
          ? 'Retry tags again, or close and edit the subscription later.'
          : `Edit ${subscriptionName} to apply its tags.`,
      })
    } finally {
      writeInFlightRef.current = false
      setIsRetryingTags(false)
    }
  }

  // Editing always goes straight to form
  const showPicker = !isEditing && phase === 'picker'

  return (
    <>
      <DialogHeader>
        {!isEditing && phase === 'form' && !pendingTagSync && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToPicker}
            disabled={isSaving}
            className="text-muted-foreground hover:text-foreground -mt-2 -ml-3 self-start"
          >
            <ArrowLeft aria-hidden="true" />
            Back to templates
          </Button>
        )}
        <DialogTitle>
          {isEditing
            ? subscription
              ? `Edit ${subscription.name}`
              : 'Edit Subscription'
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
              ? 'Pick a service to prefill its details, or start from scratch.'
              : 'Fill in the details to track a new subscription.'}
        </DialogDescription>
      </DialogHeader>

      {isMissing ? (
        isLookingUp ? (
          <div role="status" className="flex flex-col gap-4 py-2">
            <span className="sr-only">Loading subscription</span>
            <Skeleton aria-hidden="true" className="h-10 w-full" />
            <div aria-hidden="true" className="grid grid-cols-2 gap-4">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
          </div>
        ) : subscriptionsError ? (
          <EmptyState
            icon={AlertTriangle}
            tone="danger"
            variant="plain"
            size="compact"
            headingLevel="h3"
            title="Couldn’t load this subscription"
            description="Nothing was changed. Check that Kessai is running, then try again."
            action={
              <Button
                variant="outline"
                onClick={() => setLookup((prev) => ({ ...prev, attempt: prev.attempt + 1 }))}
              >
                <RotateCw aria-hidden="true" />
                Retry
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={SearchX}
            variant="plain"
            size="compact"
            headingLevel="h3"
            title="This subscription isn’t here anymore"
            description="It may have been deleted. Nothing was changed."
            action={
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            }
          />
        )
      ) : showPicker ? (
        <TemplatePicker
          onSelect={handleSelectTemplate}
          onStartFromScratch={handleStartFromScratch}
        />
      ) : (
        <SubscriptionForm
          key={editingSubscriptionId || selectedTemplate?.id || 'new'}
          subscription={subscription}
          template={selectedTemplate}
          onSubmit={handleSubmit}
          onCancel={onClose}
          isLoading={isSaving}
          tagRetry={
            pendingTagSync
              ? {
                  subscriptionName: pendingTagSync.subscriptionName,
                  isRetrying: isRetryingTags,
                  onRetry: handleRetryTags,
                }
              : null
          }
        />
      )}
    </>
  )
}
