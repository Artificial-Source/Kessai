import { cn } from '@/lib/utils'
import { Check, X } from 'lucide-react'

interface PaymentIndicatorProps {
  color: string
  isPaid?: boolean
  isSkipped?: boolean
  size?: 'sm' | 'md'
}

export function PaymentIndicator({ color, isPaid, isSkipped, size = 'sm' }: PaymentIndicatorProps) {
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
  }

  if (isPaid) {
    return (
      <div
        className={cn(
          'flex items-center justify-center rounded-full',
          size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
        )}
        style={{ backgroundColor: color }}
      >
        <Check className="h-2 w-2 text-white" />
      </div>
    )
  }

  if (isSkipped) {
    return (
      <div
        className={cn(
          'bg-muted flex items-center justify-center rounded-full',
          size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
        )}
      >
        <X className="text-muted-foreground h-2 w-2" />
      </div>
    )
  }

  return (
    <div className={cn('rounded-full', sizeClasses[size])} style={{ backgroundColor: color }} />
  )
}

interface PaymentIndicatorStackProps {
  payments: Array<{
    color: string
    isPaid?: boolean
    isSkipped?: boolean
  }>
  maxVisible?: number
}

export function PaymentIndicatorStack({ payments, maxVisible = 3 }: PaymentIndicatorStackProps) {
  const visiblePayments = payments.slice(0, maxVisible)
  const remainingCount = payments.length - maxVisible

  return (
    <div className="flex items-center gap-0.5">
      {visiblePayments.map((payment, index) => (
        <PaymentIndicator
          key={index}
          color={payment.color}
          isPaid={payment.isPaid}
          isSkipped={payment.isSkipped}
          size="sm"
        />
      ))}
      {remainingCount > 0 && (
        <span className="text-muted-foreground ml-0.5 text-[10px]">+{remainingCount}</span>
      )}
    </div>
  )
}
