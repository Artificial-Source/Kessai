import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { useTrialCountdown } from '@/hooks/use-trial-countdown'

interface TrialBadgeProps {
  trialEndDate: string | null
}

/** Trial status with its countdown; amber three days out, red once it has ended. */
export const TrialBadge = memo(function TrialBadge({ trialEndDate }: TrialBadgeProps) {
  const { daysRemaining, isExpiringSoon, isExpired } = useTrialCountdown(trialEndDate)

  const label =
    daysRemaining === null
      ? 'Trial'
      : isExpired
        ? 'Trial ended'
        : daysRemaining === 0
          ? 'Trial ends today'
          : `Trial · ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'} left`

  return (
    <Badge variant={isExpired ? 'danger' : isExpiringSoon ? 'warning' : 'info'} size="sm" dot>
      {label}
    </Badge>
  )
})
