import { useState } from 'react'
import { Ban } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { Subscription } from '@/types/subscription'

const PRESET_REASONS = [
  'Too expensive',
  'Not using',
  'Found alternative',
  'Poor quality',
  'Other',
] as const

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
  const [reason, setReason] = useState('')

  const handleConfirm = async () => {
    if (!subscription) return
    await onConfirm(subscription.id, reason.trim() || undefined)
    setReason('')
    onOpenChange(false)
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) setReason('')
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="bg-destructive/10 mb-2 flex h-10 w-10 items-center justify-center rounded-lg">
            <Ban className="text-destructive h-5 w-5" />
          </div>
          <DialogTitle className="font-[family-name:var(--font-heading)]">
            Cancel Subscription
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel{' '}
            <span className="text-foreground font-medium">{subscription?.name}</span>? The
            subscription will be marked as cancelled.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label
            htmlFor="cancel-reason"
            className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase"
          >
            Reason (optional)
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_REASONS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                aria-pressed={reason === preset}
                className={`rounded-none border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors ${
                  reason === preset
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            id="cancel-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why are you cancelling? (optional)"
            rows={3}
            className="border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary w-full resize-none rounded-lg border p-3 font-[family-name:var(--font-sans)] text-sm focus:ring-1 focus:outline-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={isLoading}>
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Cancelling...
              </span>
            ) : (
              'Cancel Subscription'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
