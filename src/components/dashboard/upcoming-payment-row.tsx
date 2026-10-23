import { memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { formatAmount, type CurrencyCode } from '@/lib/currency'
import { formatShortDate, getDaysUntil } from '@/lib/date-utils'

interface UpcomingPaymentRowProps {
  subscription: {
    id: string
    name: string
    amount: number
    currency?: string
    next_payment_date?: string | null
    logo_url?: string | null
    color?: string | null
  }
  currency: CurrencyCode
}

export const UpcomingPaymentRow = memo(function UpcomingPaymentRow({
  subscription,
  currency,
}: UpcomingPaymentRowProps) {
  const daysUntil = subscription.next_payment_date
    ? getDaysUntil(subscription.next_payment_date)
    : null
  const subCurrency = (subscription.currency || currency) as CurrencyCode

  return (
    <li className="flex items-center gap-3 py-3 sm:gap-4">
      <SubscriptionLogo
        logoUrl={subscription.logo_url}
        name={subscription.name}
        color={subscription.color}
        size="md"
        decorative
        className="shrink-0 rounded-lg"
      />
      <div className="min-w-0 flex-1">
        <p className="text-foreground truncate font-medium">{subscription.name}</p>
        {subscription.next_payment_date && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {formatShortDate(subscription.next_payment_date)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
        <p className="flex items-baseline gap-1.5">
          <span className="text-foreground font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums">
            {formatAmount(subscription.amount, subCurrency)}
          </span>
          {/* Amounts in the display currency need no label; others say what they are. */}
          {subCurrency !== currency && (
            <span className="type-label text-muted-foreground">{subCurrency}</span>
          )}
        </p>
        {daysUntil === 0 ? (
          <Badge variant="warning" size="sm">
            Today
          </Badge>
        ) : daysUntil === 1 ? (
          <Badge variant="outline" size="sm">
            Tomorrow
          </Badge>
        ) : daysUntil !== null ? (
          <p className="text-muted-foreground text-xs">In {daysUntil} days</p>
        ) : null}
      </div>
    </li>
  )
})
