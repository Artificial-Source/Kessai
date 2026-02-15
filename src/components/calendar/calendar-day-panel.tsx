import { useMemo } from 'react'
import dayjs from 'dayjs'
import { X, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubscriptionCard } from './subscription-card'
import { formatCurrency } from '@/lib/currency'
import type { DayPayment } from '@/hooks/use-calendar-stats'
import type { Subscription } from '@/types/subscription'
import type { CurrencyCode } from '@/lib/currency'

interface CalendarDayPanelProps {
  isOpen: boolean
  selectedDate: Date | null
  payments: DayPayment[]
  currency?: CurrencyCode
  onClose: () => void
  onMarkPaid: (subscriptionId: string, dueDate: string, amount: number) => void
  onSkip: (subscriptionId: string, dueDate: string, amount: number) => void
  onEdit: (subscription: Subscription) => void
}

export function CalendarDayPanel({
  isOpen,
  selectedDate,
  payments,
  currency = 'USD',
  onClose,
  onMarkPaid,
  onSkip,
  onEdit,
}: CalendarDayPanelProps) {
  const totalAmount = useMemo(() => payments.reduce((sum, p) => sum + p.amount, 0), [payments])
  const unpaidPayments = useMemo(
    () => payments.filter((p) => !p.isPaid && !p.isSkipped),
    [payments]
  )

  if (!isOpen || !selectedDate) return null

  const handleMarkAllPaid = () => {
    unpaidPayments.forEach((p) => {
      onMarkPaid(p.subscription.id, p.dueDate, p.amount)
    })
  }

  return (
    <div className="glass-card animate-slide-in-right flex h-full w-full flex-col overflow-hidden shadow-2xl lg:w-[380px]">
      <div className="border-border relative border-b p-6">
        <div className="via-border absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent to-transparent" />
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-bold tracking-widest uppercase">
            Selected Day
          </span>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:bg-accent hover:text-foreground rounded-md p-1 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <h2 className="text-foreground text-3xl font-semibold tracking-tight">
          {dayjs(selectedDate).format('MMMM D')}
        </h2>
        <p className="text-muted-foreground mt-1 text-sm font-medium">
          {payments.length} payment{payments.length !== 1 ? 's' : ''} due{' '}
          <span className="text-foreground font-semibold">
            {formatCurrency(totalAmount, currency)} total
          </span>
        </p>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {payments.length > 0 ? (
          payments.map((payment) => (
            <SubscriptionCard
              key={payment.subscription.id}
              subscription={payment.subscription}
              amount={payment.amount}
              isPaid={payment.isPaid}
              isSkipped={payment.isSkipped}
              dueDate={payment.dueDate}
              currency={currency}
              onMarkPaid={() =>
                onMarkPaid(payment.subscription.id, payment.dueDate, payment.amount)
              }
              onSkip={() => onSkip(payment.subscription.id, payment.dueDate, payment.amount)}
              onEdit={() => onEdit(payment.subscription)}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <CalendarDays className="text-muted-foreground h-8 w-8" />
            </div>
            <h3 className="text-foreground mb-1 font-medium">No payments due</h3>
            <p className="text-muted-foreground text-sm">
              No subscriptions are scheduled for this day.
            </p>
          </div>
        )}
      </div>

      {unpaidPayments.length > 0 && (
        <div className="border-border bg-muted/50 border-t p-6">
          <Button onClick={handleMarkAllPaid} variant="glow" className="w-full gap-2 py-3.5">
            Mark All as Paid
          </Button>
        </div>
      )}
    </div>
  )
}
