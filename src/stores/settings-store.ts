import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Settings, Theme } from '@/types/settings'
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
}))
