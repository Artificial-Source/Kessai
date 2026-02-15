import { useState, useEffect, memo } from 'react'
import { cn } from '@/lib/utils'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { getLogoDataUrl } from '@/lib/logo-storage'
import type { DayPayment } from '@/hooks/use-calendar-stats'

interface CalendarDayProps {
  dayOfMonth: number
  isCurrentMonth: boolean
  isToday: boolean
  isSelected: boolean
  payments: DayPayment[]
  totalAmount: number
  currency: CurrencyCode
  onClick: () => void
}

const PaymentLogo = memo(function PaymentLogo({
  logoUrl,
  name,
  color,
}: {
  logoUrl?: string | null
  name: string
  color?: string
}) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    if (logoUrl) {
      getLogoDataUrl(logoUrl).then(setSrc)
    }
  }, [logoUrl])

  if (src) {
    return <img src={src} alt="" className="h-5 w-5 shrink-0 rounded-[4px] object-cover" />
  }

  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-[9px] font-bold text-white"
      style={{ backgroundColor: color || '#4f8dff' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
})

export const CalendarDay = memo(function CalendarDay({
  dayOfMonth,
  isCurrentMonth,
  isToday,
  isSelected,
  payments,
  totalAmount,
  currency,
  onClick,
}: CalendarDayProps) {
  const hasPayments = payments.length > 0
  const maxVisible = 3
  const visiblePayments = payments.slice(0, maxVisible)
  const remainingCount = payments.length - maxVisible

  return (
    <button
      onClick={onClick}
      className={cn(
        'border-border bg-background hover:bg-muted/50 flex min-h-[120px] flex-col border p-1.5 text-left',
        !isCurrentMonth && 'text-muted-foreground/40 bg-muted/20',
        isCurrentMonth && 'text-foreground',
        isToday && 'bg-primary/5',
        isSelected && 'bg-primary/10 ring-primary/60 z-10 ring-2'
      )}
    >
      {/* Header: Day number + total */}
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            'text-sm font-medium',
            isToday &&
              'bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold'
          )}
        >
          {dayOfMonth}
        </span>
        {hasPayments && totalAmount > 0 && (
          <span className="text-muted-foreground text-[10px] font-semibold">
            {formatCurrency(totalAmount, currency)}
          </span>
        )}
      </div>

      {/* Payment items */}
      <div className="flex flex-1 flex-col gap-1">
        {visiblePayments.map((p) => {
          const color = p.subscription.color || '#4f8dff'
          const isPaidOrSkipped = p.isPaid || p.isSkipped

          return (
            <div
              key={`${p.subscription.id}-${p.dueDate}`}
              className={cn(
                'flex items-center gap-1.5 rounded px-1 py-0.5',
                isPaidOrSkipped && 'opacity-50'
              )}
              style={{
                backgroundColor: `${color}15`,
                borderRadius: '3px',
              }}
            >
              <PaymentLogo
                logoUrl={p.subscription.logo_url}
                name={p.subscription.name}
                color={color}
              />
              <div className="flex min-w-0 flex-1 items-center justify-between gap-1">
                <span
                  className={cn(
                    'truncate text-[10px] font-medium',
                    isPaidOrSkipped && 'line-through'
                  )}
                  style={{ color }}
                >
                  {p.subscription.name}
                </span>
                <span className="shrink-0 text-[9px] font-semibold" style={{ color }}>
                  {formatCurrency(p.amount, currency)}
                </span>
              </div>
            </div>
          )
        })}

        {remainingCount > 0 && (
          <span className="text-muted-foreground mt-auto text-[10px] font-medium">
            +{remainingCount} more
          </span>
        )}
      </div>
    </button>
  )
})
