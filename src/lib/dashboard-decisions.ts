import dayjs from 'dayjs'
import { calculateUserMonthlyAmount, isBillableStatus } from '@/types/subscription'
import type { PriceChange } from '@/lib/api'
import type { Subscription } from '@/types/subscription'

/** Trials ending within this many days (or already ended) need a decision. */
export const TRIAL_DECISION_DAYS = 7
/** A subscription is worth reviewing once it has gone this long without a review. */
export const REVIEW_AFTER_DAYS = 30

export type Decision =
  | {
      kind: 'trial'
      id: string
      subscription: Subscription
      /** Days until the trial ends; negative once it has ended. */
      daysLeft: number
      /** The recorded next payment falls before the trial ends: the dates need checking. */
      datesConflict: boolean
    }
  | { kind: 'grace-period'; id: string; subscription: Subscription }
  | {
      kind: 'price-change'
      id: string
      subscription: Subscription
      change: PriceChange
      /** False when the currency changed: there is no comparable increase to state. */
      sameCurrency: boolean
    }

const dayOf = (date: string) => dayjs(date).startOf('day')

/** Lower ranks first: ended trials, then trials ending by tomorrow, grace periods, the rest. */
function rank(decision: Decision): number {
  if (decision.kind === 'trial') return decision.daysLeft < 0 ? 0 : decision.daysLeft <= 1 ? 1 : 3
  return decision.kind === 'grace-period' ? 2 : 4
}

/**
 * The dashboard's Decisions: trials ending within 7 days or already ended, grace periods,
 * and recorded price changes newer than the subscription's last review. Price changes count
 * only when they are an increase in the same currency, or a change of currency.
 */
export function buildDecisions(
  subscriptions: readonly Subscription[],
  priceChanges: readonly PriceChange[],
  today: string
): Decision[] {
  const start = dayOf(today)
  const decisions: Decision[] = []

  for (const subscription of subscriptions) {
    if (!subscription.is_active) continue
    if (subscription.status === 'trial' && subscription.trial_end_date) {
      const daysLeft = dayOf(subscription.trial_end_date).diff(start, 'day')
      if (daysLeft > TRIAL_DECISION_DAYS) continue
      decisions.push({
        kind: 'trial',
        id: `trial:${subscription.id}`,
        subscription,
        daysLeft,
        datesConflict: Boolean(
          subscription.next_payment_date &&
          subscription.next_payment_date < subscription.trial_end_date
        ),
      })
    } else if (subscription.status === 'grace_period') {
      decisions.push({ kind: 'grace-period', id: `grace:${subscription.id}`, subscription })
    }
  }

  const latestChange = new Map<string, PriceChange>()
  for (const change of priceChanges) {
    const latest = latestChange.get(change.subscription_id)
    if (!latest || change.changed_at > latest.changed_at) {
      latestChange.set(change.subscription_id, change)
    }
  }
  const subscriptionsById = new Map(subscriptions.map((s) => [s.id, s]))
  for (const change of latestChange.values()) {
    const subscription = subscriptionsById.get(change.subscription_id)
    if (!subscription || subscription.status === 'cancelled') continue
    const reviewedAt = subscription.last_reviewed_at
    if (reviewedAt && dayjs(change.changed_at).valueOf() <= dayjs(reviewedAt).valueOf()) continue
    const sameCurrency = change.old_currency === change.new_currency
    if (sameCurrency && change.new_amount <= change.old_amount) continue
    decisions.push({
      kind: 'price-change',
      id: `price:${change.id}`,
      subscription,
      change,
      sameCurrency,
    })
  }

  return decisions.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.kind === 'trial' && b.kind === 'trial' ? a.daysLeft - b.daysLeft : 0) ||
      (a.kind === 'price-change' && b.kind === 'price-change'
        ? b.change.changed_at.localeCompare(a.change.changed_at)
        : 0) ||
      a.subscription.name.localeCompare(b.subscription.name)
  )
}

export type ReviewCandidate = {
  subscription: Subscription
  reason: 'cancellation-pending' | 'never-reviewed' | 'not-reviewed'
  /** The date the reason refers to: status change, creation, or last review. */
  since: string | null
  /** The user's monthly-equivalent share, in the subscription's own currency. */
  monthlyShare: number
}

/**
 * "Worth reviewing": pending cancellations whose local status needs attention, and billable
 * subscriptions not reviewed for 30 days or more. A subscription never reviewed counts from
 * when it was added, so new records do not flood the list. Subscriptions already in
 * Decisions are left out. Display-currency candidates come first, highest monthly share
 * first; other currencies follow by name (their amounts are not comparable).
 */
export function buildReviewCandidates(
  subscriptions: readonly Subscription[],
  options: { today: string; displayCurrency: string; exclude?: ReadonlySet<string> }
): ReviewCandidate[] {
  const cutoff = dayOf(options.today).subtract(REVIEW_AFTER_DAYS, 'day')
  const candidates: ReviewCandidate[] = []

  for (const subscription of subscriptions) {
    if (options.exclude?.has(subscription.id)) continue
    const monthlyShare = calculateUserMonthlyAmount(
      subscription.amount,
      subscription.billing_cycle,
      subscription.shared_count
    )
    if (subscription.status === 'pending_cancellation') {
      candidates.push({
        subscription,
        reason: 'cancellation-pending',
        since: subscription.status_changed_at ?? null,
        monthlyShare,
      })
      continue
    }
    if (!subscription.is_active || !isBillableStatus(subscription.status)) continue
    // Trials and grace periods have their own deadlines in Decisions.
    if (subscription.status !== 'active') continue
    const basis = subscription.last_reviewed_at ?? subscription.created_at
    if (dayOf(basis).isAfter(cutoff)) continue
    candidates.push({
      subscription,
      reason: subscription.last_reviewed_at ? 'not-reviewed' : 'never-reviewed',
      since: basis,
      monthlyShare,
    })
  }

  const order = (candidate: ReviewCandidate) =>
    candidate.reason === 'cancellation-pending'
      ? 0
      : candidate.subscription.currency === options.displayCurrency
        ? 1
        : 2
  return candidates.sort(
    (a, b) =>
      order(a) - order(b) ||
      (order(a) === 1 ? b.monthlyShare - a.monthlyShare : 0) ||
      a.subscription.name.localeCompare(b.subscription.name)
  )
}
