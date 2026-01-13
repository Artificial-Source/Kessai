import { motion } from 'framer-motion'
import { TrendingUp, TrendingDown, Calendar, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

interface MonthSummaryHeaderProps {
  totalAmount: number
  paidAmount: number
  upcomingAmount: number
  paymentCount: number
  paidCount: number
  comparisonToPrevMonth: number
  currency?: CurrencyCode
}

export function MonthSummaryHeader({
  totalAmount,
  paidAmount,
  paymentCount,
  paidCount,
  comparisonToPrevMonth,
  currency = 'USD',
}: MonthSummaryHeaderProps) {
  const progressPercentage = paymentCount > 0 ? (paidCount / paymentCount) * 100 : 0
  const isUp = comparisonToPrevMonth > 0
  const isDown = comparisonToPrevMonth < 0

  return (
    <div className="mb-6 grid grid-cols-3 gap-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-muted-foreground text-sm">Monthly Total</span>
          {(isUp || isDown) && (
            <div
              className={cn(
                'flex items-center gap-1 text-xs',
                isUp ? 'text-rose-400' : 'text-emerald-400'
              )}
            >
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(comparisonToPrevMonth).toFixed(0)}%</span>
            </div>
          )}
        </div>
        <motion.p
          key={totalAmount}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-2xl font-bold"
        >
          {formatCurrency(totalAmount, currency)}
        </motion.p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span className="text-muted-foreground text-sm">Paid</span>
        </div>
        <p className="text-2xl font-bold text-emerald-400">
          {formatCurrency(paidAmount, currency)}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-violet-400" />
          <span className="text-muted-foreground text-sm">Progress</span>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-2xl font-bold">
            {paidCount}/{paymentCount}
          </p>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            />
          </div>
        </div>
      </motion.div>
    </div>
  )
}
