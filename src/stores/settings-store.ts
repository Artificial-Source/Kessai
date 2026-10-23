import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import { logger } from '@/lib/logger'
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

export const useSettingsStore = create<SettingsState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let queue: Promise<void> = Promise.resolve()
  let confirmed: Settings | null = null
  const patches: { data: Partial<Settings> }[] = []

  const publish = () => {
    if (!confirmed) return
    set({
      settings: patches.reduce((settings, patch) => ({ ...settings, ...patch.data }), confirmed),
    })
  }

  return {
    settings: null,
    isLoading: false,
    error: null,

    fetch: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = patches.length === 0
      set({ isLoading: true, error: null })
      try {
        const settings = await invoke('get_settings')
        logger.info('store:settings', 'fetched settings')
        if (request === fetchRequest && started === generation && canPublish) {
          confirmed = settings
          set({ settings })
        }
      } catch (error) {
        logger.error('store:settings', 'fetch failed', error)
        if (request === fetchRequest && started === generation && canPublish) {
          set({
            settings: get().settings ?? { id: 'singleton', ...DEFAULT_SETTINGS },
            error: String(error),
          })
        }
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },

    update: async (data) => {
      const current = get().settings
      if (!current) return
      if (patches.length === 0) confirmed = current
      const patch = { data: { ...data } }
      patches.push(patch)
      generation++
      publish()

      const operation = queue.then(async () => {
        try {
          confirmed = await invoke('update_settings', { data: patch.data })
          set({ error: null })
          logger.info('store:settings', `updated: ${Object.keys(data).join(', ')}`)
        } catch (error) {
          set({ error: String(error) })
          logger.error('store:settings', 'update failed', error)
          throw error
        } finally {
          patches.splice(patches.indexOf(patch), 1)
          generation++
          publish()
        }
      })
      queue = operation.catch(() => undefined)
      await operation
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
  }
})
