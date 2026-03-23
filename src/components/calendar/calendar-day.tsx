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
    return (
      <img
        src={src}
        alt=""
        className="h-5 w-5 shrink-0 rounded object-cover"
        style={{ borderRadius: '3px' }}
      />
    )
  }

  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center text-[9px] font-bold text-white"
      style={{ backgroundColor: color || '#bf5af2', borderRadius: '3px' }}
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

  const ariaLabel = hasPayments
    ? `${dayOfMonth}, ${payments.length} payment${payments.length !== 1 ? 's' : ''}`
    : `${dayOfMonth}`

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        'border-border bg-background focus-visible:ring-ring focus-visible:ring-offset-background flex min-h-[60px] flex-col border p-1 text-left hover:bg-[var(--color-subtle-overlay)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none sm:min-h-[100px] sm:p-2',
        !isCurrentMonth && 'text-muted-foreground/40 bg-muted/50',
        isCurrentMonth && 'text-foreground',
        isToday && 'bg-primary/5',
        isSelected && 'bg-primary/10 ring-primary z-10 ring-2'
      )}
    >
      {/* Header: Day number + total */}
      <div className="mb-1 flex items-center justify-between">
        <span
          className={cn(
            'font-[family-name:var(--font-mono)] text-xs font-bold',
            isToday &&
              'bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs'
          )}
        >
          {dayOfMonth}
        </span>
        {hasPayments && totalAmount > 0 && (
          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[9px]">
            {formatCurrency(totalAmount, currency)}
          </span>
        )}
      </div>

      {/* Payment items */}
      <div className="flex flex-1 flex-col gap-1">
        {visiblePayments.map((p) => {
          const color = p.subscription.color || '#bf5af2'
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
                    'truncate font-[family-name:var(--font-mono)] text-[9px]',
                    isPaidOrSkipped && 'line-through'
                  )}
                  style={{ color }}
                >
                  {p.subscription.name}
                </span>
                <span
                  className="hidden shrink-0 font-[family-name:var(--font-mono)] text-[9px] font-bold sm:inline"
                  style={{ color }}
                >
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
