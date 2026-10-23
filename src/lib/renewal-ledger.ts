import dayjs from 'dayjs'
import { roundToCurrencyUnits } from '@/lib/totals'
import { isBillableStatus } from '@/types/subscription'
import type { CalendarOccurrence } from '@/types/payment'
import type { BillingCycle, Subscription, SubscriptionStatus } from '@/types/subscription'

/** Days the dashboard ledger covers: today through today + 29, inclusive. */
export const LEDGER_DAYS = 30

const DATE = 'YYYY-MM-DD'

export type CalendarMonthRef = { year: number; month: number }

export type LedgerWindow = {
  /** First day of the window (local date, YYYY-MM-DD). */
  start: string
  /** Last day of the window, inclusive: start + 29 days. */
  end: string
  /** Every calendar month the window touches, oldest first (two, occasionally three). */
  months: CalendarMonthRef[]
}

/** One unresolved charge in the ledger. */
export type LedgerEntry = {
  /** The recorded payment's ID, or `subscriptionId:dueDate` for a projected occurrence. */
  key: string
  subscriptionId: string
  name: string
  logoUrl: string | null
  color: string | null
  currency: string
  billingCycle: BillingCycle
  status: SubscriptionStatus
  dueDate: string
  /** Whole days from the window start (today) to the due date; negative when earlier. */
  daysUntil: number
  /** Full charge: a recorded (pending) payment amount wins over the projection. */
  amount: number
  /** People sharing the cost; 1 when not shared. */
  sharedCount: number
  /** The user's part of `amount` when the cost is shared, otherwise null. */
  share: number | null
}

export type LedgerGroupId = 'today' | 'week' | 'later'

export type LedgerGroup = {
  id: LedgerGroupId
  /** First and last date the group covers, inclusive. */
  start: string
  end: string
  entries: LedgerEntry[]
}

export type LedgerSubtotal = {
  /** Sum of full charges in the display currency. */
  amount: number
  /** Charges counted in `amount`. */
  count: number
  /** Charges left out of `amount` because they bill in another currency, by code. */
  excludedCurrencies: Record<string, number>
}

export type RenewalLedger = {
  window: LedgerWindow
  /** Unresolved charges from today through the window end, by due date. */
  upcoming: LedgerEntry[]
  /** `upcoming` split into Today, Next 7 days and Later; empty groups are left out. */
  groups: LedgerGroup[]
  /** Current-month due dates before today with no paid or skipped record. */
  earlier: LedgerEntry[]
  /** Totals of `upcoming` only; `earlier` is never counted as a coming charge. */
  subtotal: LedgerSubtotal
}

/** The ledger window that starts on `today` (YYYY-MM-DD, local). */
export function ledgerWindow(today: string): LedgerWindow {
  const start = dayjs(today).startOf('day')
  const last = start.add(LEDGER_DAYS - 1, 'day')
  const months: CalendarMonthRef[] = []
  for (let cursor = start.startOf('month'); !cursor.isAfter(last, 'month');) {
    months.push({ year: cursor.year(), month: cursor.month() + 1 })
    cursor = cursor.add(1, 'month')
  }
  return { start: start.format(DATE), end: last.format(DATE), months }
}

export const calendarMonthKey = ({ year, month }: CalendarMonthRef) =>
  `${year}-${String(month).padStart(2, '0')}`

/** "Oct 23 – 29" within one month, "Oct 30 – Nov 20" across two, "Oct 22" for one day. */
export function formatDateRange(start: string, end: string): string {
  const from = dayjs(start)
  const to = dayjs(end)
  if (from.isSame(to, 'day')) return from.format('MMM D')
  const yearSuffix = from.isSame(to, 'year') ? '' : `, ${to.year()}`
  return `${from.format('MMM D')} – ${to.format(from.isSame(to, 'month') ? 'D' : 'MMM D')}${yearSuffix}`
}

/** A recorded paid or skipped outcome resolves an occurrence; pending does not. */
export const isResolved = (occurrence: CalendarOccurrence) =>
  occurrence.payment?.status === 'paid' || occurrence.payment?.status === 'skipped'

const GROUP_RANGES: ReadonlyArray<{ id: LedgerGroupId; from: number; to: number }> = [
  { id: 'today', from: 0, to: 0 },
  { id: 'week', from: 1, to: 7 },
  { id: 'later', from: 8, to: LEDGER_DAYS - 1 },
]

const byDueDate = (a: LedgerEntry, b: LedgerEntry) =>
  a.dueDate.localeCompare(b.dueDate) ||
  a.name.localeCompare(b.name) ||
  a.subscriptionId.localeCompare(b.subscriptionId) ||
  a.key.localeCompare(b.key)

/**
 * The dashboard's 30-day renewal ledger, built from the calendar's month projections (the
 * same source as Calendar, so weekly plans appear once per due date). Paid and skipped
 * occurrences are left out; pending and unrecorded ones stay. Rows keep the full charge in
 * their own currency; the subtotal sums only the display currency and counts the rest.
 *
 * @param occurrences - Projections of every month in `ledgerWindow(today).months`
 * @param options.subscriptions - Loaded subscriptions, for sharing counts and colors
 */
export function buildRenewalLedger(
  occurrences: readonly CalendarOccurrence[],
  options: { today: string; displayCurrency: string; subscriptions: readonly Subscription[] }
): RenewalLedger {
  const window = ledgerWindow(options.today)
  const start = dayjs(window.start)
  const currentMonth = window.start.slice(0, 7)
  const subscriptionsById = new Map(options.subscriptions.map((s) => [s.id, s]))

  const upcoming: LedgerEntry[] = []
  const earlier: LedgerEntry[] = []
  const seen = new Set<string>()

  for (const occurrence of occurrences) {
    if (isResolved(occurrence)) continue
    // A pending record of a subscription that no longer bills is not a coming charge.
    if (!occurrence.is_active || !isBillableStatus(occurrence.status)) continue
    const key = occurrence.payment?.id ?? `${occurrence.subscription_id}:${occurrence.due_date}`
    if (seen.has(key)) continue
    seen.add(key)

    const inWindow = occurrence.due_date >= window.start && occurrence.due_date <= window.end
    const earlierThisMonth =
      occurrence.due_date < window.start && occurrence.due_date.startsWith(currentMonth)
    if (!inWindow && !earlierThisMonth) continue

    const subscription = subscriptionsById.get(occurrence.subscription_id)
    const sharedCount = Math.max(subscription?.shared_count ?? 1, 1)
    const amount = occurrence.payment?.amount ?? occurrence.projected_amount
    const entry: LedgerEntry = {
      key,
      subscriptionId: occurrence.subscription_id,
      name: occurrence.name,
      logoUrl: occurrence.logo_url,
      color: subscription?.color ?? null,
      currency: occurrence.currency,
      billingCycle: occurrence.billing_cycle,
      status: occurrence.status,
      dueDate: occurrence.due_date,
      daysUntil: dayjs(occurrence.due_date).diff(start, 'day'),
      amount,
      sharedCount,
      share:
        sharedCount > 1 ? roundToCurrencyUnits(amount / sharedCount, occurrence.currency) : null,
    }
    ;(inWindow ? upcoming : earlier).push(entry)
  }

  upcoming.sort(byDueDate)
  earlier.sort(byDueDate)

  const groups = GROUP_RANGES.map(({ id, from, to }) => ({
    id,
    start: start.add(from, 'day').format(DATE),
    end: start.add(to, 'day').format(DATE),
    entries: upcoming.filter((entry) => entry.daysUntil >= from && entry.daysUntil <= to),
  })).filter((group) => group.entries.length > 0)

  const subtotal: LedgerSubtotal = { amount: 0, count: 0, excludedCurrencies: {} }
  for (const entry of upcoming) {
    if (entry.currency === options.displayCurrency) {
      subtotal.amount += entry.amount
      subtotal.count++
    } else {
      subtotal.excludedCurrencies[entry.currency] =
        (subtotal.excludedCurrencies[entry.currency] ?? 0) + 1
    }
  }
  subtotal.amount = roundToCurrencyUnits(subtotal.amount, options.displayCurrency)

  return { window, upcoming, groups, earlier, subtotal }
}

export type MonthRecords = {
  /** Occurrences due in the month, every currency. */
  count: number
  paid: { count: number; amount: number }
  /** Neither paid nor skipped, including earlier dates and the rest of the month. */
  unrecorded: { count: number; amount: number }
  skippedCount: number
  /** Occurrences whose amounts are left out because they bill in another currency. */
  excludedCurrencies: Record<string, number>
}

/**
 * What has been recorded against one month's due dates: full charges in the display
 * currency (amounts) and every occurrence (counts). Skipped occurrences are counted, never
 * added to an amount. Due-month records are not a cash statement: `paid_at` may differ.
 */
export function summarizeMonthRecords(
  occurrences: readonly CalendarOccurrence[],
  displayCurrency: string
): MonthRecords {
  const records: MonthRecords = {
    count: occurrences.length,
    paid: { count: 0, amount: 0 },
    unrecorded: { count: 0, amount: 0 },
    skippedCount: 0,
    excludedCurrencies: {},
  }
  for (const occurrence of occurrences) {
    const status = occurrence.payment?.status
    if (status === 'skipped') {
      records.skippedCount++
      continue
    }
    const bucket = status === 'paid' ? records.paid : records.unrecorded
    bucket.count++
    if (occurrence.currency === displayCurrency) {
      bucket.amount += occurrence.payment?.amount ?? occurrence.projected_amount
    } else {
      records.excludedCurrencies[occurrence.currency] =
        (records.excludedCurrencies[occurrence.currency] ?? 0) + 1
    }
  }
  records.paid.amount = roundToCurrencyUnits(records.paid.amount, displayCurrency)
  records.unrecorded.amount = roundToCurrencyUnits(records.unrecorded.amount, displayCurrency)
  return records
}

/** The soonest billable renewal after `date`, for "nothing in the next 30 days" states. */
export function nextRenewalAfter(
  subscriptions: readonly Subscription[],
  date: string
): Subscription | null {
  let next: Subscription | null = null
  for (const subscription of subscriptions) {
    const due = subscription.next_payment_date
    if (!due || due <= date) continue
    if (!subscription.is_active || !isBillableStatus(subscription.status)) continue
    if (!next || due < next.next_payment_date!) next = subscription
  }
  return next
}
