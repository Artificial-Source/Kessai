import { motion } from 'framer-motion'
import { Check, X, Edit2, SkipForward } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { Button } from '@/components/ui/button'
import type { Subscription } from '@/types/subscription'

interface SubscriptionCardProps {
  subscription: Subscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  dueDate: string
  currency?: CurrencyCode
  onMarkPaid: () => void
  onSkip: () => void
  onEdit: () => void
}

export function SubscriptionCard({
  subscription,
  amount,
  isPaid,
  isSkipped,
  currency = 'USD',
  onMarkPaid,
  onSkip,
  onEdit,
}: SubscriptionCardProps) {
  const isRecorded = isPaid || isSkipped

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={cn(
        'rounded-xl border p-4 backdrop-blur-xl transition-all',
        isRecorded ? 'border-white/10 bg-white/5' : 'border-white/15 bg-white/8'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: subscription.color || '#8b5cf6' }}
        >
          {subscription.name.charAt(0).toUpperCase()}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-medium">{subscription.name}</h4>
            {isPaid && (
              <span className="flex items-center gap-1 text-xs text-emerald-400">
                <Check className="h-3 w-3" />
                Paid
              </span>
            )}
            {isSkipped && (
              <span className="text-muted-foreground flex items-center gap-1 text-xs">
                <X className="h-3 w-3" />
                Skipped
              </span>
            )}
          </div>
          <p className="text-lg font-bold">{formatCurrency(amount, currency)}</p>
        </div>

        {!isRecorded && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={onSkip}
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            >
              <SkipForward className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onEdit}
              className="text-muted-foreground hover:text-foreground h-8 w-8 p-0"
            >
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              onClick={onMarkPaid}
              className="border border-emerald-500/30 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
            >
              <Check className="mr-1 h-4 w-4" />
              Pay
            </Button>
          </div>
        )}
      </div>
    </motion.div>
  )
}
