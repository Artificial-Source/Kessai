import { useId } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { plural } from '@/lib/commitment'
import { cn } from '@/lib/utils'
import { CompactDecision } from './decision-item'
import type { Decision } from '@/lib/dashboard-decisions'

interface UrgentDecisionsProps {
  decisions: Decision[]
  onReview: (subscriptionId: string) => void
  /** The full Decisions heading further down, which "Show all" moves focus to. */
  decisionsHeadingId: string
  className?: string
}

/**
 * Below lg the rail sits under the ledger, so the most urgent decision (two from md) is
 * previewed above it on one line each, with a way to the full list and its quick fixes.
 * Nothing renders when no decision is due.
 */
export function UrgentDecisions({
  decisions,
  onReview,
  decisionsHeadingId,
  className,
}: UrgentDecisionsProps) {
  const titleId = useId()
  if (decisions.length === 0) return null

  const showAllDecisions = () => {
    const heading = document.getElementById(decisionsHeadingId)
    heading?.scrollIntoView({ block: 'start' })
    heading?.focus({ preventScroll: true })
  }

  return (
    <Card asChild padding="none" className={cn('px-4 pt-1 sm:px-5', className)}>
      <section aria-labelledby={titleId}>
        <h2 id={titleId} className="sr-only">
          Needs a decision
        </h2>
        <ul>
          {decisions.slice(0, 2).map((decision, index) => (
            <CompactDecision
              key={decision.id}
              decision={decision}
              onReview={onReview}
              className={cn(index > 0 && 'border-border hidden border-t md:flex')}
            />
          ))}
        </ul>
        <div className="border-border flex items-center justify-between gap-3 border-t">
          <p className="text-muted-foreground text-xs">
            <span className="md:hidden">
              {decisions.length > 1 ? `1 of ${plural(decisions.length, 'decision')}` : '1 decision'}
            </span>
            <span className="hidden md:inline">
              {decisions.length > 2
                ? `2 of ${plural(decisions.length, 'decision')}`
                : plural(decisions.length, 'decision')}
            </span>
          </p>
          {/* Text-styled, but a full 44px target on every pointer (PRODUCT.md touch floor). */}
          <Button
            variant="link"
            onClick={showAllDecisions}
            aria-label="Show all decisions"
            className="text-muted-foreground hover:text-foreground -mr-1 min-h-11 min-w-11 px-1 text-xs"
          >
            Show all
          </Button>
        </div>
      </section>
    </Card>
  )
}
