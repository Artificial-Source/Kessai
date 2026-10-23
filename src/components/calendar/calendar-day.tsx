import { memo } from 'react'
import dayjs from 'dayjs'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/currency'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { paymentCountLabel, summarizeDay } from './day-summary'
import type { DayPayment } from '@/hooks/use-calendar-stats'

/** Entries a wide cell lists before collapsing the rest into "+N more". */
const MAX_ENTRIES = 2
/** Payment dots a narrow (phone) cell draws before the count takes over. */
const MAX_DOTS = 3

interface CalendarDayProps {
  date: Date
  isToday: boolean
  isSelected: boolean
  payments: DayPayment[]
  displayCurrency: string
  /** Set when the day opens a dialog (below the side-panel breakpoint). */
  opensDialog?: boolean
  onSelect: (date: Date) => void
}

function dayLabel(date: Date, isToday: boolean, payments: DayPayment[], displayCurrency: string) {
  const parts = [dayjs(date).format('dddd, MMMM D')]
  if (isToday) parts.push('today')
  if (payments.length === 0) {
    parts.push('no payments')
  } else {
    const summary = summarizeDay(payments, displayCurrency)
    parts.push(paymentCountLabel(payments.length), summary.perCurrencyLabel)
    if (summary.paidCount > 0) parts.push(`${summary.paidCount} paid`)
    if (summary.skippedCount > 0) parts.push(`${summary.skippedCount} skipped`)
  }
  return parts.join(', ')
}

/**
 * One month-grid day, sized by container query: wide cells list up to two payments (logo,
 * name, amount when it fits), tablet-width cells show up to three logos, and phone cells one
 * dot per payment. The button's label always carries the full detail.
 */
export const CalendarDay = memo(function CalendarDay({
  date,
  isToday,
  isSelected,
  payments,
  displayCurrency,
  opensDialog = false,
  onSelect,
}: CalendarDayProps) {
  const visible = payments.slice(0, MAX_ENTRIES)
  const hiddenCount = payments.length - visible.length
  const extraDots = payments.length - MAX_DOTS

  return (
    <button
      type="button"
      onClick={() => onSelect(date)}
      aria-label={dayLabel(date, isToday, payments, displayCurrency)}
      aria-current={isToday ? 'date' : undefined}
      aria-haspopup={opensDialog ? 'dialog' : undefined}
      className={cn(
        'bg-background hover:bg-surface-highest/40 @container flex min-h-14 min-w-0 flex-col gap-1.5 p-1.5 text-left transition-colors duration-150 focus-visible:outline-offset-[-2px] sm:min-h-[6.5rem] sm:p-2',
        isSelected && 'bg-surface-highest/40 ring-primary ring-2 ring-inset'
      )}
    >
      <span
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-sm font-[family-name:var(--font-mono)] text-xs font-bold tabular-nums',
          isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'
        )}
      >
        {dayjs(date).date()}
      </span>

      {payments.length > 0 ? (
        <>
          {/* Phone cells: one dot per payment. A recorded payment drops its brand color for
              muted ink, like the struck-through names in wide cells; neither a hollow ring nor
              a dimmed fill tells a paid near-black brand (GitHub, Notion) from an unpaid one.
              On paper the muted dot needs 70% (#898989 on #fafafa, 3.3:1) to clear 3:1 while
              staying lighter than an unpaid dot's solid muted fill (#585858). */}
          <span className="flex items-center gap-1 @min-[4.5rem]:hidden" aria-hidden="true">
            {payments.slice(0, MAX_DOTS).map((payment) => {
              const recorded = payment.isPaid || payment.isSkipped
              return (
                <span
                  key={payment.id ?? `${payment.subscription.id}:${payment.dueDate}`}
                  data-recorded={recorded || undefined}
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    recorded
                      ? 'bg-muted-foreground/70 dark:bg-muted-foreground/40'
                      : 'border-border-hover border'
                  )}
                  style={
                    recorded
                      ? undefined
                      : {
                          backgroundColor:
                            payment.subscription.color || 'var(--color-muted-foreground)',
                        }
                  }
                />
              )
            })}
            {extraDots > 0 ? (
              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] leading-none">
                +{extraDots}
              </span>
            ) : null}
          </span>

          {/* Tablet cells: a row of logos, too narrow for names. */}
          <span
            className="hidden items-center gap-1 @min-[4.5rem]:flex @min-[5.5rem]:hidden"
            aria-hidden="true"
          >
            {payments.slice(0, MAX_DOTS).map((payment) => (
              <SubscriptionLogo
                key={payment.id ?? `${payment.subscription.id}:${payment.dueDate}`}
                logoUrl={payment.subscription.logo_url}
                name={payment.subscription.name}
                color={payment.subscription.color}
                size="sm"
                decorative
                className={cn(
                  'shrink-0 rounded-sm',
                  (payment.isPaid || payment.isSkipped) && 'opacity-40'
                )}
              />
            ))}
            {extraDots > 0 ? (
              <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] leading-none">
                +{extraDots}
              </span>
            ) : null}
          </span>

          {/* Wide cells: up to two named entries, amounts once the cell is wide enough. */}
          <span className="hidden min-w-0 flex-col gap-1 @min-[5.5rem]:flex" aria-hidden="true">
            {visible.map((payment) => {
              const recorded = payment.isPaid || payment.isSkipped
              return (
                <span
                  key={payment.id ?? `${payment.subscription.id}:${payment.dueDate}`}
                  className="flex min-w-0 items-center gap-1.5"
                >
                  <SubscriptionLogo
                    logoUrl={payment.subscription.logo_url}
                    name={payment.subscription.name}
                    color={payment.subscription.color}
                    size="sm"
                    decorative
                    className="shrink-0 rounded-sm"
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-[11px] leading-tight',
                      recorded ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}
                  >
                    {payment.subscription.name}
                  </span>
                  <span
                    className={cn(
                      'hidden shrink-0 font-[family-name:var(--font-mono)] text-[11px] leading-tight tabular-nums @min-[8.5rem]:inline',
                      recorded ? 'text-muted-foreground line-through' : 'text-foreground'
                    )}
                  >
                    {formatCurrency(payment.amount, payment.subscription.currency)}
                  </span>
                </span>
              )
            })}
            {hiddenCount > 0 ? (
              <span className="type-label text-muted-foreground">+{hiddenCount} more</span>
            ) : null}
          </span>
        </>
      ) : null}
    </button>
  )
})
