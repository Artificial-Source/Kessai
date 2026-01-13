import { z } from 'zod'

export const PaymentStatus = {
  PAID: 'paid',
  SKIPPED: 'skipped',
  PENDING: 'pending',
} as const

export type PaymentStatusType = (typeof PaymentStatus)[keyof typeof PaymentStatus]

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
