import { useMemo } from 'react'
import dayjs from 'dayjs'
import { CalendarClock } from 'lucide-react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { formatCurrency } from '@/lib/currency'
import type { CurrencyCode } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'


interface ReminderPreviewProps {
  daysBefore: number[]
}

interface UpcomingReminder {
  subscription: Subscription
  paymentDate: string
  reminderDate: string
  daysUntilPayment: number
  daysUntilReminder: number
}

/**
 * Computes upcoming reminders for the next 30 days based on notification_days_before settings.
 */
function computeUpcomingReminders(
  subscriptions: Subscription[],
  daysBefore: number[]
): UpcomingReminder[] {
  const today = dayjs().startOf('day')
  const horizon = today.add(30, 'day').endOf('day')
  const reminders: UpcomingReminder[] = []

  for (const sub of subscriptions) {
    if (!sub.is_active || !sub.next_payment_date) continue

    const paymentDate = dayjs(sub.next_payment_date).startOf('day')
    if (paymentDate.isAfter(horizon)) continue
    if (paymentDate.isBefore(today)) continue

    const daysUntilPayment = paymentDate.diff(today, 'day')

    for (const advDays of daysBefore) {
      const reminderDate = paymentDate.subtract(advDays, 'day')
      const daysUntilReminder = reminderDate.diff(today, 'day')

      // Only include reminders that are today or in the future (within 30-day window)
      if (daysUntilReminder >= 0) {
        reminders.push({
          subscription: sub,
          paymentDate: paymentDate.format('YYYY-MM-DD'),
          reminderDate: reminderDate.format('YYYY-MM-DD'),
          daysUntilPayment,
          daysUntilReminder,
        })
      }
    }
  }

  // Sort by reminder date (soonest first), then by subscription name
  reminders.sort((a, b) => {
    const dateDiff = a.daysUntilReminder - b.daysUntilReminder
    if (dateDiff !== 0) return dateDiff
    return a.subscription.name.localeCompare(b.subscription.name)
  })

  return reminders
}

/**
 * Formats a relative label for when a reminder fires.
 */
function reminderTimeLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  return `in ${daysUntil} days`
}

export function ReminderPreview({ daysBefore }: ReminderPreviewProps) {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)

  const reminders = useMemo(
    () => computeUpcomingReminders(subscriptions, daysBefore),
    [subscriptions, daysBefore]
  )

  if (daysBefore.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CalendarClock className="text-muted-foreground h-5 w-5" />
        <p className="text-muted-foreground text-xs">
          Select at least one advance notice period to see upcoming reminders
        </p>
      </div>
    )
  }

  if (reminders.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <CalendarClock className="text-muted-foreground h-5 w-5" />
        <p className="text-muted-foreground text-xs">No upcoming reminders in the next 30 days</p>
      </div>
    )
  }

  // Show at most 6 reminders
  const displayed = reminders.slice(0, 6)
  const remaining = reminders.length - displayed.length

  return (
    <div className="flex flex-col gap-2">
      {displayed.map((reminder) => {
        const sub = reminder.subscription
        const amount = formatCurrency(sub.amount, sub.currency as CurrencyCode)
        const payDate = dayjs(reminder.paymentDate).format('MMM D')

        return (
          <div
            key={`${sub.id}-${reminder.paymentDate}-${reminder.daysUntilReminder}`}
            className="border-border bg-muted/30 flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
          >
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="text-foreground font-[family-name:var(--font-sans)] text-sm truncate">
                {sub.name}
              </span>
              <span className="text-muted-foreground text-[11px]">
                Reminder{' '}
                <span className="font-[family-name:var(--font-mono)]">
                  {reminderTimeLabel(reminder.daysUntilReminder)}
                </span>
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5 shrink-0">
              <span className="text-foreground font-[family-name:var(--font-mono)] text-sm">
                {amount}
              </span>
              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px]">
                {payDate}
              </span>
            </div>
          </div>
        )
      })}
      {remaining > 0 && (
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] text-center pt-1">
          +{remaining} more reminder{remaining !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
