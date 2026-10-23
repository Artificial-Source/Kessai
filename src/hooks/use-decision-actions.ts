import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSubscriptionStore } from '@/stores/subscription-store'
import type { Subscription } from '@/types/subscription'

/** In-place resolutions offered by Decisions and Worth reviewing. */
export type DecisionAction = 'keep-trial' | 'mark-reviewed'

export type DecisionActionState = { busy: DecisionAction | null; error: string | null }

type FocusControl = {
  expectRemoval: (key: string) => void
  cancelRemoval: () => void
  keepFocusOn: (key: string) => void
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/**
 * Runs Keep (a trial becomes active in Kessai's record) and Mark reviewed with a busy state,
 * an inline error, a toast, and focus kept in the list when the item leaves it. Neither
 * action contacts the provider; the toast says so for trials.
 */
export function useDecisionActions(focus: FocusControl) {
  const transitionStatus = useSubscriptionStore((s) => s.transitionStatus)
  const markReviewed = useSubscriptionStore((s) => s.markReviewed)
  const [states, setStates] = useState<Record<string, DecisionActionState>>({})
  const running = useRef(new Set<string>())
  const { expectRemoval, cancelRemoval, keepFocusOn } = focus

  const run = useCallback(
    async (key: string, subscription: Subscription, action: DecisionAction) => {
      if (running.current.has(key)) return
      running.current.add(key)
      setStates((previous) => ({ ...previous, [key]: { busy: action, error: null } }))
      // Keep is applied optimistically, so the item may leave the list before this resolves.
      expectRemoval(key)
      try {
        if (action === 'keep-trial') {
          await transitionStatus(subscription.id, 'active')
          toast.success(`${subscription.name} recorded as active`, {
            description: 'Kessai updates its own record only; nothing changes with the provider.',
          })
        } else {
          await markReviewed(subscription.id)
          toast.success(`Marked ${subscription.name} as reviewed`)
        }
        setStates((previous) => ({ ...previous, [key]: { busy: null, error: null } }))
      } catch (error) {
        cancelRemoval()
        const message = errorMessage(error)
        setStates((previous) => ({ ...previous, [key]: { busy: null, error: message } }))
        toast.error(`Couldn't update ${subscription.name}`, { description: message })
      } finally {
        running.current.delete(key)
        keepFocusOn(key)
      }
    },
    [transitionStatus, markReviewed, expectRemoval, cancelRemoval, keepFocusOn]
  )

  return { states, run }
}
