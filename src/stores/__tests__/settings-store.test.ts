import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../settings-store'
import { DEFAULT_SETTINGS } from '@/types/settings'

const mockInvoke = vi.fn()

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}))

const mockSettings = {
  id: 'singleton',
  theme: 'dark' as const,
  currency: 'USD',
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
  reduce_motion: false,
  enable_transitions: true,
  enable_hover_effects: true,
  animation_speed: 'normal' as const,
}

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: null,
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
  })

  describe('fetch', () => {
    it('fetches settings and updates state', async () => {
      mockInvoke.mockResolvedValue(mockSettings)

      await useSettingsStore.getState().fetch()

      expect(mockInvoke).toHaveBeenCalledWith('get_settings')
      const state = useSettingsStore.getState()
      expect(state.settings).toEqual(mockSettings)
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('sets loading state during fetch', async () => {
      mockInvoke.mockResolvedValue(mockSettings)

      const fetchPromise = useSettingsStore.getState().fetch()
      expect(useSettingsStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(useSettingsStore.getState().isLoading).toBe(false)
    })

    it('falls back to defaults on fetch error', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await useSettingsStore.getState().fetch()

      const state = useSettingsStore.getState()
      expect(state.settings).toEqual({ id: 'singleton', ...DEFAULT_SETTINGS })
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('optimistically updates settings', async () => {
      const updated = { ...mockSettings, currency: 'EUR' }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().update({ currency: 'EUR' })

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', { data: { currency: 'EUR' } })
      expect(useSettingsStore.getState().settings?.currency).toBe('EUR')
    })

    it('rolls back on update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().update({ currency: 'EUR' })).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.currency).toBe('USD')
    })

    it('does nothing when settings are null', async () => {
      useSettingsStore.setState({ settings: null })

      await useSettingsStore.getState().update({ currency: 'EUR' })

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('setTheme', () => {
    it('updates theme via update', async () => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
      const updated = { ...mockSettings, theme: 'light' as const }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setTheme('light')

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', { data: { theme: 'light' } })
    })
  })

  describe('setCurrency', () => {
    it('updates currency via update', async () => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
      const updated = { ...mockSettings, currency: 'GBP' }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setCurrency('GBP')

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', { data: { currency: 'GBP' } })
    })
  })

  describe('setNotifications', () => {
    it('updates notification_enabled', async () => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
      const updated = { ...mockSettings, notification_enabled: false }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setNotifications(false)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { notification_enabled: false },
      })
    })

    it('updates notification_enabled with daysBefore', async () => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
      const updated = {
        ...mockSettings,
        notification_enabled: true,
        notification_days_before: [1, 7],
      }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setNotifications(true, [1, 7])

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { notification_enabled: true, notification_days_before: [1, 7] },
      })
    })
  })
})
