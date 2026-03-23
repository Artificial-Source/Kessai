import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { DEFAULT_SETTINGS } from '../settings'
import type { Settings, Theme, AnimationSpeed } from '../settings'

// Re-create the schema for testing since it's not exported (prefixed with _)
const themeSchema = z.enum(['dark', 'light', 'system'])
const animationSpeedSchema = z.enum(['slow', 'normal', 'fast'])

const settingsSchema = z.object({
  id: z.string(),
  theme: themeSchema,
  currency: z.string().length(3),
  notification_enabled: z.boolean(),
  notification_days_before: z.array(z.number()),
  notification_advance_days: z.number().min(1).max(30),
  notification_time: z.string().regex(/^\d{2}:\d{2}$/),
  monthly_budget: z.number().nullable().optional(),
  reduce_motion: z.boolean(),
  enable_transitions: z.boolean(),
  enable_hover_effects: z.boolean(),
  animation_speed: animationSpeedSchema,
})

const validSettings: Settings = {
  id: 'singleton',
  ...DEFAULT_SETTINGS,
}

describe('Settings schema', () => {
  it('validates a valid settings object', () => {
    const result = settingsSchema.safeParse(validSettings)
    expect(result.success).toBe(true)
  })

  it('rejects invalid theme value', () => {
    const result = settingsSchema.safeParse({ ...validSettings, theme: 'midnight' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid theme values', () => {
    const themes: Theme[] = ['dark', 'light', 'system']
    themes.forEach((theme) => {
      const result = themeSchema.safeParse(theme)
      expect(result.success).toBe(true)
    })
  })

  it('rejects invalid animation speed', () => {
    const result = settingsSchema.safeParse({ ...validSettings, animation_speed: 'turbo' })
    expect(result.success).toBe(false)
  })

  it('accepts all valid animation speeds', () => {
    const speeds: AnimationSpeed[] = ['slow', 'normal', 'fast']
    speeds.forEach((speed) => {
      const result = animationSpeedSchema.safeParse(speed)
      expect(result.success).toBe(true)
    })
  })

  it('rejects notification_advance_days below 1', () => {
    const result = settingsSchema.safeParse({ ...validSettings, notification_advance_days: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects notification_advance_days above 30', () => {
    const result = settingsSchema.safeParse({ ...validSettings, notification_advance_days: 31 })
    expect(result.success).toBe(false)
  })

  it('accepts notification_advance_days at boundaries (1 and 30)', () => {
    expect(
      settingsSchema.safeParse({ ...validSettings, notification_advance_days: 1 }).success
    ).toBe(true)
    expect(
      settingsSchema.safeParse({ ...validSettings, notification_advance_days: 30 }).success
    ).toBe(true)
  })

  it('rejects invalid notification_time format', () => {
    const result = settingsSchema.safeParse({ ...validSettings, notification_time: '9:00' })
    expect(result.success).toBe(false)
  })

  it('accepts valid notification_time format', () => {
    const result = settingsSchema.safeParse({ ...validSettings, notification_time: '23:59' })
    expect(result.success).toBe(true)
  })

  it('rejects currency with wrong length', () => {
    expect(settingsSchema.safeParse({ ...validSettings, currency: 'US' }).success).toBe(false)
    expect(settingsSchema.safeParse({ ...validSettings, currency: 'USDD' }).success).toBe(false)
  })

  it('accepts null monthly_budget', () => {
    const result = settingsSchema.safeParse({ ...validSettings, monthly_budget: null })
    expect(result.success).toBe(true)
  })

  it('accepts numeric monthly_budget', () => {
    const result = settingsSchema.safeParse({ ...validSettings, monthly_budget: 100 })
    expect(result.success).toBe(true)
  })
})

describe('DEFAULT_SETTINGS', () => {
  it('has expected default values', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('dark')
    expect(DEFAULT_SETTINGS.currency).toBe('USD')
    expect(DEFAULT_SETTINGS.notification_enabled).toBe(true)
    expect(DEFAULT_SETTINGS.animation_speed).toBe('normal')
    expect(DEFAULT_SETTINGS.reduce_motion).toBe(false)
    expect(DEFAULT_SETTINGS.enable_transitions).toBe(true)
    expect(DEFAULT_SETTINGS.enable_hover_effects).toBe(true)
  })

  it('validates against the schema when id is added', () => {
    const result = settingsSchema.safeParse({ id: 'singleton', ...DEFAULT_SETTINGS })
    expect(result.success).toBe(true)
  })
})
