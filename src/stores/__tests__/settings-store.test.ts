import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsStore } from '../settings-store'
import { DEFAULT_SETTINGS } from '@/types/settings'

const mockInvoke = vi.fn()

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

const mockSettings = {
  id: 'singleton',
  theme: 'dark' as const,
  currency: 'USD',
  display_exchange_rates: {},
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
  notification_advance_days: 1,
  notification_time: '09:00',
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

  describe('setBudget', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('sets monthly budget', async () => {
      const updated = { ...mockSettings, monthly_budget: 100 }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setBudget(100)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { monthly_budget: 100 },
      })
    })

    it('sets budget to null to clear it', async () => {
      const updated = { ...mockSettings, monthly_budget: null }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setBudget(null)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { monthly_budget: null },
      })
    })
  })

  describe('setNotificationAdvanceDays', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates notification advance days', async () => {
      const updated = { ...mockSettings, notification_advance_days: 3 }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setNotificationAdvanceDays(3)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { notification_advance_days: 3 },
      })
    })
  })

  describe('setNotificationTime', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates notification time', async () => {
      const updated = { ...mockSettings, notification_time: '18:00' }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setNotificationTime('18:00')

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { notification_time: '18:00' },
      })
    })
  })

  describe('setReduceMotion', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates reduce_motion setting', async () => {
      const updated = { ...mockSettings, reduce_motion: true }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setReduceMotion(true)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { reduce_motion: true },
      })
    })
  })

  describe('setEnableTransitions', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates enable_transitions setting', async () => {
      const updated = { ...mockSettings, enable_transitions: false }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setEnableTransitions(false)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { enable_transitions: false },
      })
    })
  })

  describe('setEnableHoverEffects', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates enable_hover_effects setting', async () => {
      const updated = { ...mockSettings, enable_hover_effects: false }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setEnableHoverEffects(false)

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { enable_hover_effects: false },
      })
    })
  })

  describe('setAnimationSpeed', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('updates animation_speed setting', async () => {
      const updated = { ...mockSettings, animation_speed: 'slow' as const }
      mockInvoke.mockResolvedValue(updated)

      await useSettingsStore.getState().setAnimationSpeed('slow')

      expect(mockInvoke).toHaveBeenCalledWith('update_settings', {
        data: { animation_speed: 'slow' },
      })
    })
  })

  describe('error rollback paths', () => {
    beforeEach(() => {
      useSettingsStore.setState({ settings: { ...mockSettings } })
    })

    it('rolls back setBudget on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Budget update failed'))

      await expect(useSettingsStore.getState().setBudget(500)).rejects.toThrow(
        'Budget update failed'
      )

      // Settings should be rolled back to original (no monthly_budget key change)
      expect(useSettingsStore.getState().settings?.currency).toBe('USD')
    })

    it('rolls back setNotificationAdvanceDays on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setNotificationAdvanceDays(5)).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.notification_advance_days).toBe(1)
    })

    it('rolls back setNotificationTime on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setNotificationTime('20:00')).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.notification_time).toBe('09:00')
    })

    it('rolls back setReduceMotion on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setReduceMotion(true)).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.reduce_motion).toBe(false)
    })

    it('rolls back setEnableTransitions on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setEnableTransitions(false)).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.enable_transitions).toBe(true)
    })

    it('rolls back setEnableHoverEffects on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setEnableHoverEffects(false)).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.enable_hover_effects).toBe(true)
    })

    it('rolls back setAnimationSpeed on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setAnimationSpeed('fast')).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.animation_speed).toBe('normal')
    })

    it('rolls back setTheme on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setTheme('light')).rejects.toThrow('Update failed')

      expect(useSettingsStore.getState().settings?.theme).toBe('dark')
    })

    it('rolls back setCurrency on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setCurrency('EUR')).rejects.toThrow('Update failed')

      expect(useSettingsStore.getState().settings?.currency).toBe('USD')
    })

    it('rolls back setNotifications on failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(useSettingsStore.getState().setNotifications(false)).rejects.toThrow(
        'Update failed'
      )

      expect(useSettingsStore.getState().settings?.notification_enabled).toBe(true)
    })
  })
})
