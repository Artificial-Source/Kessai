import { z } from 'zod'

export const tagSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required').max(30),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  created_at: z.string(),
})

export const newTagSchema = z.object({
  name: z.string().min(1, 'Name is required').max(30, 'Name too long'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color')
    .optional(),
})

export const subscriptionTagLinkSchema = z.object({
  subscription_id: z.string(),
  tag_id: z.string(),
})

export type Tag = z.infer<typeof tagSchema>
export type NewTag = z.infer<typeof newTagSchema>
export type SubscriptionTagLink = z.infer<typeof subscriptionTagLinkSchema>

export const TAG_COLORS = [
  '#6b7280',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
] as const
