import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import type { Subscription } from '@/types/subscription'

interface DayPayment {
  subscription: Subscription
  amount: number
  isPaid: boolean
  isSkipped: boolean
  dueDate: string
}

interface CalendarDayProps {
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  payments: DayPayment[]
  totalAmount: number
  onClick: () => void
}

export function CalendarDay({
  dayOfMonth,
  isCurrentMonth,
  isToday,
  isSelected,
  payments,
  onClick,
}: CalendarDayProps) {
  const hasPayments = payments.length > 0
  const maxLogos = 3
  const visiblePayments = payments.slice(0, maxLogos)
  const remainingCount = payments.length - maxLogos

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'relative h-20 w-full rounded-lg transition-all duration-200',
        'flex flex-col items-center justify-start gap-1 pt-1',
        'border backdrop-blur-sm',
        isCurrentMonth
          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
          : 'text-muted-foreground/50 border-transparent bg-transparent',
        isToday && 'border-violet-500/30 bg-violet-500/10 ring-2 ring-violet-500/50',
        isSelected && 'border-violet-500/50 bg-violet-500/20',
        hasPayments && !isSelected && 'bg-white/8'
      )}
    >
      <span
        className={cn(
          'text-sm font-medium',
          isToday && 'text-violet-400',
          isSelected && 'text-violet-300'
        )}
      >
        {dayOfMonth}
      </span>

      {hasPayments && (
        <div className="flex flex-wrap items-center justify-center gap-1 px-1">
          {visiblePayments.map((p, idx) => (
            <SubscriptionLogo
              key={idx}
              logoUrl={p.subscription.logo_url}
              name={p.subscription.name}
              color={p.subscription.color}
              size="sm"
              className={cn(p.isPaid && 'opacity-60')}
            />
          ))}
          {remainingCount > 0 && (
            <span className="text-muted-foreground text-[10px]">+{remainingCount}</span>
          )}
        </div>
      )}

      {isToday && (
        <motion.div
          layoutId="today-glow"
          className="absolute inset-0 -z-10 rounded-lg bg-violet-500/20"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        />
      )}
    </motion.button>
  )
}
