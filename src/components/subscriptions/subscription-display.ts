import dayjs from 'dayjs'
import { formatPaymentDate, formatShortDate } from '@/lib/date-utils'
import {
  isBillableStatus,
  NORMALIZATION_LABELS,
  NORMALIZATION_SUFFIXES,
} from '@/types/subscription'
import type { NormalizationPeriod, Subscription, SubscriptionStatus } from '@/types/subscription'

/**
 * Headline totals carry the same names on the dashboard and the Subscriptions header.
 * "Billed monthly/yearly" sum what those cycles charge; the period total spreads every
 * billable subscription over one period (a month unless the user picked another).
 */
export const BILLED_MONTHLY_LABEL = 'Billed monthly'
export const BILLED_YEARLY_LABEL = 'Billed yearly'

export function periodTotalLabel(period: NormalizationPeriod): string {
  return period === 'as-is' ? 'Monthly total' : `${NORMALIZATION_LABELS[period]} total`
}

export function periodTotalSuffix(period: NormalizationPeriod): string {
  return period === 'as-is' ? '/mo' : NORMALIZATION_SUFFIXES[period]
}

/** A billable subscription switched off reads as paused, even before the server confirms it. */
export function subscriptionDisplayStatus(
  sub: Pick<Subscription, 'status' | 'is_active'>
): SubscriptionStatus {
  return !sub.is_active && isBillableStatus(sub.status) ? 'paused' : sub.status
}

/** "Oct 24" this year, "Oct 24, 2027" otherwise: short enough for a phone row, never ambiguous. */
export function formatRowDate(date: string): string {
  return dayjs(date).year() === dayjs().year() ? formatShortDate(date) : formatPaymentDate(date)
}
