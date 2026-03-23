import { memo, useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { Eye, ChevronDown, ChevronUp, Check, XCircle } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { Button } from '@/components/ui/button'
import type { Subscription } from '@/types/subscription'

export const ReviewNudgeCard = memo(function ReviewNudgeCard() {
  const { needingReview, markReviewed, transitionStatus } = useSubscriptionStore(
    useShallow((state) => ({
      needingReview: state.needingReview,
      markReviewed: state.markReviewed,
      transitionStatus: state.transitionStatus,
    }))
  )
  const [collapsed, setCollapsed] = useState(false)
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  const handleStillUsing = useCallback(
    async (sub: Subscription) => {
      setLoadingIds((prev) => new Set(prev).add(sub.id))
      try {
        await markReviewed(sub.id)
        toast.success(`${sub.name} marked as still in use`)
      } catch {
        toast.error('Failed to mark subscription as reviewed')
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(sub.id)
          return next
        })
      }
    },
    [markReviewed]
  )

  const handleCancel = useCallback(
    async (sub: Subscription) => {
      setLoadingIds((prev) => new Set(prev).add(sub.id))
      try {
        await transitionStatus(sub.id, 'pending_cancellation')
        toast.success(`${sub.name} marked for cancellation`)
      } catch {
        toast.error('Failed to start cancellation')
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          next.delete(sub.id)
          return next
        })
      }
    },
    [transitionStatus]
  )

  if (needingReview.length === 0) return null

  return (
    <div className="glass-card border-primary/20 p-5">
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 text-primary flex h-8 w-8 items-center justify-center rounded-lg">
            <Eye className="h-4 w-4" />
          </div>
          <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
            Time to review
          </h3>
          <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-bold tracking-wider uppercase">
            {needingReview.length}
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="text-muted-foreground h-4 w-4" />
        ) : (
          <ChevronUp className="text-muted-foreground h-4 w-4" />
        )}
      </button>

      {!collapsed && (
        <div className="mt-4 flex flex-col gap-2">
          {needingReview.map((sub) => {
            const isLoading = loadingIds.has(sub.id)
            const lastReviewed = sub.last_reviewed_at
              ? `${dayjs().diff(dayjs(sub.last_reviewed_at), 'day')}d ago`
              : 'never'

            return (
              <div
                key={sub.id}
                className="border-border flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-foreground min-w-0 truncate text-sm font-medium">
                    {sub.name}
                  </span>
                  <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                    Reviewed {lastReviewed}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleStillUsing(sub)}
                    className="gap-1.5 text-xs"
                  >
                    <Check className="h-3 w-3" />
                    Still using
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleCancel(sub)}
                    className="text-destructive hover:text-destructive gap-1.5 text-xs"
                  >
                    <XCircle className="h-3 w-3" />
                    Cancel
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})
