import { memo } from 'react'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { STATUS_LABELS } from '@/types/subscription'
import type { SubscriptionStatus } from '@/types/subscription'

/** DESIGN.md status mapping: one tone per lifecycle state. */
const STATUS_TONES: Record<SubscriptionStatus, BadgeVariant> = {
  trial: 'info',
  active: 'success',
  paused: 'warning',
  grace_period: 'warning',
  pending_cancellation: 'caution',
  cancelled: 'danger',
}

export const StatusBadge = memo(function StatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <Badge variant={STATUS_TONES[status]} size="sm" dot>
      {STATUS_LABELS[status]}
    </Badge>
  )
})
