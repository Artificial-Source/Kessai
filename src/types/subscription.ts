import { z } from 'zod'

export const billingCycleSchema = z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom'])

export const subscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'paused',
  'pending_cancellation',
  'grace_period',
  'cancelled',
])

export const subscriptionSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required').max(100),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3),
  billing_cycle: billingCycleSchema,
  billing_day: z.number().min(1).max(31).nullable(),
  category_id: z.string().nullable(),
  card_id: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format')
    .nullable(),
  logo_url: z.string().nullable().optional(),
  notes: z.string().max(500).nullable(),
  is_active: z.boolean(),
  next_payment_date: z.string().nullable(),
  status: subscriptionStatusSchema.default('active'),
  trial_end_date: z.string().nullable().optional(),
  status_changed_at: z.string().nullable().optional(),
  shared_count: z.number().int().min(1).default(1),
  is_pinned: z.boolean().default(false),
  cancellation_reason: z.string().nullable().optional(),
  cancelled_at: z.string().nullable().optional(),
  last_reviewed_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})

export const newSubscriptionSchema = subscriptionSchema.omit({
  id: true,
  created_at: true,
  updated_at: true,
})

export const subscriptionFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3),
  billing_cycle: billingCycleSchema,
  billing_day: z.number().min(1).max(31).nullable(),
  category_id: z.string().nullable(),
  card_id: z.string().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color')
    .nullable(),
  logo_url: z.string().nullable().optional(),
  notes: z.string().max(500).nullable(),
  next_payment_date: z.string().min(1, 'Payment date is required'),
  is_trial: z.boolean(),
  trial_end_date: z.string().nullable().optional(),
  shared_count: z.number().int().min(1).max(99),
  is_pinned: z.boolean(),
})

export type Subscription = z.infer<typeof subscriptionSchema>
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>
export type BillingCycle = z.infer<typeof billingCycleSchema>
export type NewSubscription = z.infer<typeof newSubscriptionSchema>
export type SubscriptionFormData = z.infer<typeof subscriptionFormSchema>

export const BILLING_CYCLE_MULTIPLIERS: Record<BillingCycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  custom: 12,
}

export const SUBSCRIPTION_COLORS = [
  '#8b5cf6',
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#6b7280',
] as const

export const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial: 'Trial',
  active: 'Active',
  paused: 'Paused',
  pending_cancellation: 'Cancelling',
  grace_period: 'Grace Period',
  cancelled: 'Cancelled',
}

export const STATUS_COLORS: Record<SubscriptionStatus, string> = {
  trial: 'text-info',
  active: 'text-success',
  paused: 'text-warning',
  pending_cancellation: 'text-accent-orange',
  grace_period: 'text-warning',
  cancelled: 'text-destructive',
}

export const STATUS_DOT_COLORS: Record<SubscriptionStatus, string> = {
  trial: 'bg-info',
  active: 'bg-success',
  paused: 'bg-warning',
  pending_cancellation: 'bg-accent-orange',
  grace_period: 'bg-warning',
  cancelled: 'bg-destructive',
}

export function isBillableStatus(status: SubscriptionStatus): boolean {
  return status === 'trial' || status === 'active' || status === 'grace_period'
}

export function calculateYearlyAmount(amount: number, cycle: BillingCycle): number {
  return amount * BILLING_CYCLE_MULTIPLIERS[cycle]
}

export function calculateMonthlyAmount(amount: number, cycle: BillingCycle): number {
  return calculateYearlyAmount(amount, cycle) / 12
}

export function calculateUserMonthlyAmount(
  amount: number,
  cycle: BillingCycle,
  sharedCount: number
): number {
  return calculateMonthlyAmount(amount, cycle) / Math.max(sharedCount, 1)
}

export function calculateUserYearlyAmount(
  amount: number,
  cycle: BillingCycle,
  sharedCount: number
): number {
  return calculateYearlyAmount(amount, cycle) / Math.max(sharedCount, 1)
}

export function compareSubscriptionDisplayPriority(a: Subscription, b: Subscription): number {
  if (a.is_pinned && !b.is_pinned) return -1
  if (!a.is_pinned && b.is_pinned) return 1

  if (a.is_active && !b.is_active) return -1
  if (!a.is_active && b.is_active) return 1

  return 0
}

export type NormalizationPeriod = 'as-is' | 'daily' | 'weekly' | 'monthly' | 'yearly'

export const NORMALIZATION_LABELS: Record<NormalizationPeriod, string> = {
  'as-is': 'As billed',
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export const NORMALIZATION_SUFFIXES: Record<Exclude<NormalizationPeriod, 'as-is'>, string> = {
  daily: '/day',
  weekly: '/wk',
  monthly: '/mo',
  yearly: '/yr',
}

/**
 * Convert an amount from any billing cycle to a target normalization period.
 * First normalizes to monthly, then converts to the target period.
 */
export function calculateNormalizedAmount(
  amount: number,
  billingCycle: BillingCycle,
  targetPeriod: NormalizationPeriod
): number {
  if (targetPeriod === 'as-is') return amount

  // Step 1: Normalize to monthly
  const monthly = calculateMonthlyAmount(amount, billingCycle)

  // Step 2: Convert from monthly to target period
  switch (targetPeriod) {
    case 'daily':
      return monthly / 30.44
    case 'weekly':
      return monthly / 4.33
    case 'monthly':
      return monthly
    case 'yearly':
      return monthly * 12
  }
}
