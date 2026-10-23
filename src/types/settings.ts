import { z } from 'zod'

const themeSchema = z.enum(['dark', 'light', 'system'])
const animationSpeedSchema = z.enum(['slow', 'normal', 'fast'])

export const settingsSchema = z.object({
  id: z.string(),
  theme: themeSchema,
  currency: z.string().length(3),
  display_exchange_rates: z.record(z.string().length(3), z.number().positive()).default({}),
  notification_enabled: z.boolean(),
  notification_days_before: z.array(z.number().int().min(0).max(30)),
  notification_advance_days: z.number().min(1).max(30),
  notification_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  monthly_budget: z.number().nullable().optional(),
  reduce_motion: z.boolean(),
  enable_transitions: z.boolean(),
  enable_hover_effects: z.boolean(),
  animation_speed: animationSpeedSchema,
})

export type Theme = z.infer<typeof themeSchema>
export type AnimationSpeed = z.infer<typeof animationSpeedSchema>
export type Settings = z.infer<typeof settingsSchema>

export const DEFAULT_SETTINGS: Omit<Settings, 'id'> = {
  theme: 'dark',
  currency: 'USD',
  display_exchange_rates: {},
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
  notification_advance_days: 1,
  notification_time: '09:00',
  monthly_budget: null,
  reduce_motion: false,
  enable_transitions: true,
  enable_hover_effects: true,
  animation_speed: 'normal',
}
