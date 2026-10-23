import { z } from 'zod'

const cardTypeSchema = z.enum(['credit', 'debit'])

export const paymentCardSchema = z.object({
  id: z.string(),
  name: z.string(),
  card_type: cardTypeSchema,
  last_four: z
    .string()
    .regex(/^\d{4}$/, 'Must contain exactly four digits')
    .nullable()
    .optional(),
  color: z.string(),
  credit_limit: z.number().nullable().optional(),
  created_at: z.string().optional(),
})

export type PaymentCard = z.infer<typeof paymentCardSchema>

export const paymentCardFormSchema = z.object({
  name: z.string().min(1, 'Card name is required'),
  card_type: cardTypeSchema,
  last_four: z
    .string()
    .regex(/^(?:\d{4})?$/, 'Must contain exactly four digits')
    .optional(),
  color: z.string(),
  credit_limit: z.number().positive().optional(),
})

export type PaymentCardFormData = z.infer<typeof paymentCardFormSchema>

export const CARD_COLORS = [
  '#6b7280',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#f97316',
]
