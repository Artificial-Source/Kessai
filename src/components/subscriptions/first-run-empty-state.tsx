import { useNavigate } from 'react-router-dom'
import { CreditCard, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useUiStore } from '@/stores/ui-store'

interface FirstRunEmptyStateProps {
  /** `plain` inside an existing card (dashboard), `surface` on its own (Subscriptions). */
  variant?: 'surface' | 'plain'
  headingLevel?: 'h2' | 'h3'
}

/** What a new user sees before tracking anything: add the first subscription, or import. */
export function FirstRunEmptyState({
  variant = 'surface',
  headingLevel = 'h2',
}: FirstRunEmptyStateProps) {
  const openSubscriptionDialog = useUiStore((state) => state.openSubscriptionDialog)
  const navigate = useNavigate()

  return (
    <EmptyState
      icon={CreditCard}
      variant={variant}
      headingLevel={headingLevel}
      title="No subscriptions yet"
      description="Add the services you pay for to see what’s due, what it costs each month, and when trials end."
      action={
        <>
          <Button variant="glow" onClick={() => openSubscriptionDialog()}>
            <Plus aria-hidden="true" />
            Add your first subscription
          </Button>
          <Button variant="outline" onClick={() => navigate('/settings#data')}>
            <Upload aria-hidden="true" />
            Import data
          </Button>
        </>
      }
    />
  )
}
