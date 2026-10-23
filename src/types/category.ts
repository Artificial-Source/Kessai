import { z } from 'zod'

export const categorySchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required').max(50),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color format'),
  icon: z.string().min(1),
  is_default: z.boolean(),
  created_at: z.string(),
})

export const newCategorySchema = categorySchema.omit({
  id: true,
  is_default: true,
  created_at: true,
})

export const categoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50, 'Name too long'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Invalid color'),
  icon: z.string().min(1, 'Icon is required'),
})

export type Category = z.infer<typeof categorySchema>
export type NewCategory = z.infer<typeof newCategorySchema>
export type CategoryFormData = z.infer<typeof categoryFormSchema>

export const DEFAULT_CATEGORY_COLORS = [
  '#8b5cf6',
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
  '#f97316',
  '#6b7280',
  '#ef4444',
] as const

export const CATEGORY_ICONS = [
  'play-circle',
  'code',
  'gamepad-2',
  'music',
  'cloud',
  'briefcase',
  'heart-pulse',
  'newspaper',
  'box',
  'tv',
  'film',
  'book-open',
  'shopping-cart',
  'car',
  'home',
  'globe',
  'phone',
  'wifi',
  'credit-card',
  'gift',
] as const
