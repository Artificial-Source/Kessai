import type { Subscription } from '@/types/subscription'

export function getUpcomingPaymentsForNotification(
  subscriptions: Subscription[],
  notificationDays: number[]
): Subscription[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return subscriptions.filter((sub) => {
    if (!sub.is_active || !sub.next_payment_date) return false

    const dueDate = new Date(sub.next_payment_date)
    dueDate.setHours(0, 0, 0, 0)

    const daysUntil = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    return notificationDays.includes(daysUntil)
  })
}
