import { memo, useMemo } from 'react'
import dayjs from 'dayjs'
import { FlaskConical } from 'lucide-react'
import type { Subscription } from '@/types/subscription'

interface TrialAlertCardProps {
  subscriptions: Subscription[]
}

export const TrialAlertCard = memo(function TrialAlertCard({ subscriptions }: TrialAlertCardProps) {
  const { activeTrials, expiringThisWeek, expiredTrials } = useMemo(() => {
    const today = dayjs().startOf('day')
    const weekEnd = today.add(7, 'day')

    const trials = subscriptions.filter((s) => s.status === 'trial' && s.is_active)
    const active: Subscription[] = []
    const expiring: Subscription[] = []
    const expired: Subscription[] = []

    for (const sub of trials) {
      if (!sub.trial_end_date) {
        active.push(sub)
        continue
      }

      const endDate = dayjs(sub.trial_end_date)
      if (endDate.isBefore(today)) {
        expired.push(sub)
      } else if (endDate.isBefore(weekEnd)) {
        expiring.push(sub)
        active.push(sub)
      } else {
        active.push(sub)
      }
    }

    return {
      activeTrials: active,
      expiringThisWeek: expiring,
      expiredTrials: expired,
    }
  }, [subscriptions])

  const totalCount = activeTrials.length + expiredTrials.length
  if (totalCount === 0) return null

  return (
    <div className="glass-card border-amber-500/20 p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
          <FlaskConical className="h-4 w-4" />
        </div>
        <h3 className="text-foreground font-[family-name:var(--font-heading)] text-lg font-bold">
          Free Trials
        </h3>
      </div>

      <div className="flex flex-col gap-3">
        {activeTrials.length > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-sm">Active trials</span>
            <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold">
              {activeTrials.length}
            </span>
          </div>
        )}

        {expiringThisWeek.length > 0 && (
          <div className="border-border rounded-lg border bg-amber-500/5 p-3">
            <p className="mb-2 font-[family-name:var(--font-mono)] text-[10px] tracking-wider text-amber-500 uppercase">
              Expiring this week
            </p>
            <div className="flex flex-col gap-1.5">
              {expiringThisWeek.map((sub) => {
                const daysLeft = dayjs(sub.trial_end_date).diff(dayjs().startOf('day'), 'day')
                return (
                  <div key={sub.id} className="flex items-center justify-between">
                    <span className="text-foreground text-sm">{sub.name}</span>
                    <span className="font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider text-amber-500">
                      {daysLeft === 0 ? 'TODAY' : `${daysLeft}D LEFT`}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {expiredTrials.length > 0 && (
          <div className="border-border bg-destructive/5 rounded-lg border p-3">
            <p className="text-destructive mb-2 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
              Expired trials
            </p>
            <div className="flex flex-col gap-1.5">
              {expiredTrials.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between">
                  <span className="text-foreground text-sm">{sub.name}</span>
                  <span className="text-destructive font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider">
                    EXPIRED
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
