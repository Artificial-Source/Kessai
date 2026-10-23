import { z } from 'zod'
import type { Subscription } from './subscription'

export const paymentSchema = z.object({
  id: z.string(),
  subscription_id: z.string(),
  amount: z.number(),
  paid_at: z.string(),
  due_date: z.string(),
  status: z.enum(['paid', 'skipped', 'pending']).default('paid'),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
})

export type Payment = z.infer<typeof paymentSchema>

export const paymentFormSchema = z.object({
  subscription_id: z.string().min(1, 'Subscription is required'),
  amount: z.number().positive('Amount must be positive'),
  paid_at: z.string().min(1, 'Payment date is required'),
  due_date: z.string().min(1, 'Due date is required'),
  status: z.enum(['paid', 'skipped', 'pending']).default('paid'),
  notes: z.string().optional(),
})

export type PaymentFormData = z.infer<typeof paymentFormSchema>

export interface PaymentWithSubscription extends Payment {
  subscription_name: string
  subscription_color: string | null
  category_name: string | null
  category_color: string | null
}

export type CalendarOccurrence = Pick<
  Subscription,
  'name' | 'category_id' | 'currency' | 'billing_cycle' | 'status' | 'is_active'
> & {
  subscription_id: string
  due_date: string
  logo_url: string | null
  projected_amount: number
  payment: Payment | null
}
