import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type { Settings, Theme, AnimationSpeed } from '@/types/settings'
import { DEFAULT_SETTINGS } from '@/types/settings'

type SettingsState = {
  settings: Settings | null
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  update: (data: Partial<Settings>) => Promise<void>
  setTheme: (theme: Theme) => Promise<void>
  setCurrency: (currency: string) => Promise<void>
  setNotifications: (enabled: boolean, daysBefore?: number[]) => Promise<void>
  setNotificationAdvanceDays: (days: number) => Promise<void>
  setNotificationDaysBefore: (days: number[]) => Promise<void>
  setNotificationTime: (time: string) => Promise<void>
  setBudget: (budget: number | null) => Promise<void>
  setReduceMotion: (enabled: boolean) => Promise<void>
  setEnableTransitions: (enabled: boolean) => Promise<void>
  setEnableHoverEffects: (enabled: boolean) => Promise<void>
  setAnimationSpeed: (speed: AnimationSpeed) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const settings = await invoke<Settings>('get_settings')
      set({ settings, isLoading: false })
    } catch (e) {
      set({
        settings: { id: 'singleton', ...DEFAULT_SETTINGS },
        error: String(e),
        isLoading: false,
      })
    }
  },

  update: async (data) => {
    const current = get().settings
    if (!current) return

    // Optimistic update
    set({ settings: { ...current, ...data } })

    try {
      const updated = await invoke<Settings>('update_settings', { data })
      set({ settings: updated })
    } catch (error) {
      // Rollback
      set({ settings: current })
      console.error('Failed to update settings:', error)
      throw error
    }
  },

  setTheme: async (theme) => {
    await get().update({ theme })
  },

  setCurrency: async (currency) => {
    await get().update({ currency })
  },

  setNotifications: async (enabled, daysBefore) => {
    await get().update({
      notification_enabled: enabled,
      ...(daysBefore && { notification_days_before: daysBefore }),
    })
  },

  setBudget: async (budget) => {
    await get().update({ monthly_budget: budget })
  },

  setReduceMotion: async (enabled) => {
    await get().update({ reduce_motion: enabled })
  },

  setEnableTransitions: async (enabled) => {
    await get().update({ enable_transitions: enabled })
  },

  setEnableHoverEffects: async (enabled) => {
    await get().update({ enable_hover_effects: enabled })
  },

  setAnimationSpeed: async (speed) => {
    await get().update({ animation_speed: speed })
  },

  setNotificationAdvanceDays: async (days) => {
    await get().update({ notification_advance_days: days })
  },

  setNotificationDaysBefore: async (days) => {
    await get().update({ notification_days_before: days })
  },

  setNotificationTime: async (time) => {
    await get().update({ notification_time: time })
  },
}))
