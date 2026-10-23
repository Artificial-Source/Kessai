import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSettings } from '../use-settings'
import { useSettingsStore } from '@/stores/settings-store'
import type { Settings } from '@/types/settings'

const mockSettings: Settings = {
  id: 'singleton',
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

describe('useSettings', () => {
  beforeEach(() => {
    useSettingsStore.setState({
      settings: mockSettings,
      isLoading: false,
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      setTheme: vi.fn().mockResolvedValue(undefined),
      setCurrency: vi.fn().mockResolvedValue(undefined),
      setNotifications: vi.fn().mockResolvedValue(undefined),
      setNotificationAdvanceDays: vi.fn().mockResolvedValue(undefined),
      setNotificationTime: vi.fn().mockResolvedValue(undefined),
    })
  })

  it('returns settings from store', () => {
    const { result } = renderHook(() => useSettings())

    expect(result.current.settings).toEqual(mockSettings)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns loading state', () => {
    useSettingsStore.setState({ isLoading: true })

    const { result } = renderHook(() => useSettings())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns error state', () => {
    useSettingsStore.setState({ error: 'Failed to load settings' })

    const { result } = renderHook(() => useSettings())

    expect(result.current.error).toBe('Failed to load settings')
  })

  it('calls fetch on mount', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ fetch: mockFetch })

    renderHook(() => useSettings())

    expect(mockFetch).toHaveBeenCalled()
  })

  it('setCurrency calls store setCurrency', async () => {
    const mockSetCurrency = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ setCurrency: mockSetCurrency })

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.setCurrency('EUR')
    })

    expect(mockSetCurrency).toHaveBeenCalledWith('EUR')
  })

  it('setNotifications calls store setNotifications', async () => {
    const mockSetNotifications = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ setNotifications: mockSetNotifications })

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.setNotifications(false)
    })

    expect(mockSetNotifications).toHaveBeenCalledWith(false)
  })

  it('setTheme calls store setTheme', async () => {
    const mockSetTheme = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ setTheme: mockSetTheme })

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.setTheme('light')
    })

    expect(mockSetTheme).toHaveBeenCalledWith('light')
  })

  it('update calls store update', async () => {
    const mockUpdate = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ update: mockUpdate })

    const { result } = renderHook(() => useSettings())

    await act(async () => {
      await result.current.update({ currency: 'GBP' })
    })

    expect(mockUpdate).toHaveBeenCalledWith({ currency: 'GBP' })
  })

  it('returns null settings when not loaded', () => {
    useSettingsStore.setState({ settings: null })

    const { result } = renderHook(() => useSettings())

    expect(result.current.settings).toBeNull()
  })

  it('refresh calls fetch again', async () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useSettingsStore.setState({ fetch: mockFetch })

    const { result } = renderHook(() => useSettings())

    // Called once on mount
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.refresh()
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
