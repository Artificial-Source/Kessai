import { memo } from 'react'
import { FlaskConical } from 'lucide-react'
import dayjs from 'dayjs'
import type { Subscription } from '@/types/subscription'

interface TrialsWidgetProps {
  expiringTrials: Subscription[]
  trialCount: number
}

export const TrialsWidget = memo(function TrialsWidget({
  expiringTrials,
  trialCount,
}: TrialsWidgetProps) {
  if (trialCount === 0) return null

  return (
    <div className="glass-card border-blue-400/20 p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-400/15 text-blue-400">
          <FlaskConical className="h-3.5 w-3.5" />
        </div>
        <h3 className="text-foreground font-[family-name:var(--font-heading)] text-sm font-bold">
          Free Trials ({trialCount})
        </h3>
      </div>
      {expiringTrials.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          {expiringTrials.map((sub) => {
            const daysLeft = dayjs(sub.trial_end_date).diff(dayjs(), 'day')
            const urgent = daysLeft <= 3
            return (
              <div key={sub.id} className="flex items-center justify-between gap-2">
                <span className="text-foreground min-w-0 truncate text-sm">{sub.name}</span>
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium ${
                    urgent ? 'bg-amber-400/10 text-amber-400' : 'bg-blue-400/10 text-blue-400'
                  }`}
                >
                  {daysLeft === 0
                    ? 'Ends today'
                    : daysLeft === 1
                      ? '1 day left'
                      : `${daysLeft} days left`}
                </span>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          {trialCount} active trial{trialCount !== 1 ? 's' : ''} — none expiring soon
        </p>
      )}
    </div>
  )
})
