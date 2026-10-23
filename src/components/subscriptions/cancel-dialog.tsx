import { useEffect, useId, useRef, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/input'
import type { Subscription } from '@/types/subscription'

const PRESET_REASONS = ['Too expensive', 'Not using', 'Found alternative', 'Poor quality'] as const
const OTHER = 'Other'

interface CancelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  subscription: Subscription | null
  isLoading?: boolean
  onConfirm: (id: string, reason?: string) => void | Promise<void>
}

export function CancelDialog({
  open,
  onOpenChange,
  subscription,
  isLoading = false,
  onConfirm,
}: CancelDialogProps) {
  // One choice at a time: a preset, or "Other" with the user's own words.
  const [choice, setChoice] = useState<string | null>(null)
  const [otherReason, setOtherReason] = useState('')
  const keepRef = useRef<HTMLButtonElement>(null)
  const groupLabelId = useId()
  const otherId = useId()
  const otherRef = useRef<HTMLTextAreaElement>(null)

  // Choosing "Other" asks for words: put the caret there.
  useEffect(() => {
    if (choice === OTHER) otherRef.current?.focus()
  }, [choice])

  const reset = () => {
    setChoice(null)
    setOtherReason('')
  }

  const handleConfirm = async () => {
    if (!subscription) return
    const reason = choice === OTHER ? otherReason.trim() || OTHER : (choice ?? undefined)
    await onConfirm(subscription.id, reason)
    reset()
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        // The safe choice gets focus, so Enter never cancels by accident.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          keepRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            <span className="text-foreground font-medium">{subscription?.name}</span> moves to
            Cancelled and stops counting toward your totals. Its payment history stays.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <p id={groupLabelId} className="text-sm leading-none font-medium">
            Reason <span className="text-muted-foreground font-normal">(optional)</span>
          </p>
          <div role="group" aria-labelledby={groupLabelId} className="flex flex-wrap gap-2">
            {[...PRESET_REASONS, OTHER].map((preset) => (
              <Button
                key={preset}
                variant="outline"
                size="sm"
                aria-pressed={choice === preset}
                onClick={() => setChoice(choice === preset ? null : preset)}
              >
                {preset}
              </Button>
            ))}
          </div>
          {choice === OTHER && (
            <div className="flex flex-col gap-2 pt-1">
              <Label htmlFor={otherId}>Your reason</Label>
              <Textarea
                id={otherId}
                ref={otherRef}
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Why are you cancelling?"
                maxLength={200}
                rows={3}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            ref={keepRef}
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Keep it
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
            aria-busy={isLoading || undefined}
          >
            {isLoading ? (
              <span
                aria-hidden="true"
                className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
              />
            ) : null}
            Cancel subscription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
