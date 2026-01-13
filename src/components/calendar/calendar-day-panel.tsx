import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { X, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubscriptionCard } from './subscription-card'
import { formatCurrency } from '@/lib/currency'
import type { Subscription } from '@/types/subscription'
import type { CurrencyCode } from '@/lib/currency'

interface DayPayment {
  subscription: Subscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  dueDate: string
}

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
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0)
  const unpaidAmount = payments
    .filter((p) => !p.isPaid && !p.isSkipped)
    .reduce((sum, p) => sum + p.amount, 0)

  return (
    <AnimatePresence>
      {isOpen && selectedDate && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="bg-background/80 h-full w-96 overflow-y-auto border-l border-white/10 p-6 backdrop-blur-xl"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold">{format(selectedDate, 'MMMM d, yyyy')}</h2>
              <p className="text-muted-foreground text-sm">{format(selectedDate, 'EEEE')}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>

          {payments.length > 0 ? (
            <>
              <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-muted-foreground text-sm">Total Due</p>
                    <p className="text-2xl font-bold">{formatCurrency(totalAmount, currency)}</p>
                  </div>
                  {unpaidAmount > 0 && unpaidAmount !== totalAmount && (
                    <div className="text-right">
                      <p className="text-muted-foreground text-sm">Remaining</p>
                      <p className="text-lg font-semibold text-amber-400">
                        {formatCurrency(unpaidAmount, currency)}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {payments.map((payment) => (
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
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/5">
                <CalendarDays className="text-muted-foreground h-8 w-8" />
              </div>
              <h3 className="mb-1 font-medium">No payments due</h3>
              <p className="text-muted-foreground text-sm">
                No subscriptions are scheduled for this day.
              </p>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
