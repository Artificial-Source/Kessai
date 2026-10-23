import { memo, useId, useMemo } from 'react'
import dayjs from 'dayjs'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useTrialCountdown } from '@/hooks/use-trial-countdown'
import type { Subscription } from '@/types/subscription'

interface TrialsWidgetProps {
  /** Active subscriptions in trial status. */
  trials: Subscription[]
}

/** Days a trial must be from its end to be listed: this week, or already over. */
const LIST_WINDOW_DAYS = 7

export const TrialsWidget = memo(function TrialsWidget({ trials }: TrialsWidgetProps) {
  const titleId = useId()

  const { listed, endingCount, endedCount } = useMemo(() => {
    const today = dayjs().startOf('day')
    const withDays = trials
      .filter((sub) => sub.trial_end_date)
      .map((sub) => ({
        sub,
        daysLeft: dayjs(sub.trial_end_date).startOf('day').diff(today, 'day'),
      }))
      .filter(({ daysLeft }) => daysLeft < LIST_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft)
    return {
      listed: withDays.map(({ sub }) => sub),
      endingCount: withDays.filter(({ daysLeft }) => daysLeft >= 0).length,
      endedCount: withDays.filter(({ daysLeft }) => daysLeft < 0).length,
    }
  }, [trials])

  if (trials.length === 0) return null

  const summary = [
    `${trials.length} ${trials.length === 1 ? 'trial' : 'trials'}`,
    endingCount > 0 && `${endingCount} ending this week`,
    endedCount > 0 && `${endedCount} ended`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card asChild>
      <section aria-labelledby={titleId}>
        <CardHeader>
          <CardTitle id={titleId}>Free trials</CardTitle>
          <CardDescription>{summary}</CardDescription>
        </CardHeader>
        {listed.length > 0 ? (
          <ul className="divide-border mt-3 divide-y">
            {listed.map((sub) => (
              <TrialRow key={sub.id} subscription={sub} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-sm">None end in the next 7 days.</p>
        )}
      </section>
    </Card>
  )
})

function TrialRow({ subscription }: { subscription: Subscription }) {
  const { formattedCountdown, isExpired, isExpiringSoon } = useTrialCountdown(
    subscription.trial_end_date
  )

  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="text-foreground min-w-0 truncate text-sm">{subscription.name}</span>
      <Badge
        size="sm"
        variant={isExpired ? 'danger' : isExpiringSoon ? 'warning' : 'info'}
        className="shrink-0"
      >
        {isExpired ? 'Ended' : formattedCountdown}
      </Badge>
    </li>
  )
}
