import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Subscription } from '@/types/subscription'
import { useNotificationScheduler } from '../use-notification-scheduler'

const { isPermissionGrantedMock, sendNotificationMock } = vi.hoisted(() => ({
  isPermissionGrantedMock: vi.fn(),
  sendNotificationMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: isPermissionGrantedMock,
  sendNotification: sendNotificationMock,
}))

const subscription: Subscription = {
  id: 'sub-1',
  name: 'Netflix',
  amount: 15.99,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: null,
  category_id: null,
  color: '#e50914',
  logo_url: null,
  notes: null,
  is_active: true,
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  next_payment_date: '2026-10-22',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('useNotificationScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0))
    Reflect.deleteProperty(window, '__TAURI__')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    localStorage.clear()
    isPermissionGrantedMock.mockReset().mockResolvedValue(true)
    sendNotificationMock.mockReset()
    useSettingsStore.setState({
      settings: { id: 'singleton', ...DEFAULT_SETTINGS, notification_days_before: [1] },
    })
    useSubscriptionStore.setState({ subscriptions: [subscription] })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.useRealTimers()
    Reflect.deleteProperty(window, '__TAURI__')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    localStorage.clear()
  })

  it('sends and deduplicates reminders in an INTERNALS-only desktop runtime', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    renderHook(() => useNotificationScheduler())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })

    expect(sendNotificationMock).toHaveBeenCalledWith({
      title: 'Netflix renews tomorrow',
      body: '$15.99/mo',
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000)
    })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('does not request notification permissions or send reminders in a browser', async () => {
    renderHook(() => useNotificationScheduler())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000)
    })

    expect(isPermissionGrantedMock).not.toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('waits until the configured time before sending a reminder', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    vi.setSystemTime(new Date(2026, 9, 21, 8, 0, 0))
    renderHook(() => useNotificationScheduler())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(sendNotificationMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000)
    })
    expect(sendNotificationMock).toHaveBeenCalledTimes(1)
  })

  it('does not send reminders when notifications are disabled', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    useSettingsStore.setState({
      settings: { id: 'singleton', ...DEFAULT_SETTINGS, notification_enabled: false },
    })
    renderHook(() => useNotificationScheduler())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60 * 1_000)
    })

    expect(isPermissionGrantedMock).not.toHaveBeenCalled()
    expect(sendNotificationMock).not.toHaveBeenCalled()
  })

  it('sends once at each configured lead day and deduplicates across restarts', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    useSettingsStore.setState({ settings: { id: 'singleton', ...DEFAULT_SETTINGS } })
    for (const day of [15, 19, 21]) {
      vi.setSystemTime(new Date(2026, 9, day, 9))
      const first = renderHook(() => useNotificationScheduler())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      first.unmount()
      const count = sendNotificationMock.mock.calls.length
      const restarted = renderHook(() => useNotificationScheduler())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      restarted.unmount()
      expect(sendNotificationMock).toHaveBeenCalledTimes(count)
    }
    expect(sendNotificationMock.mock.calls.map(([notification]) => notification.title)).toEqual([
      'Netflix renews in 7 days',
      'Netflix renews in 3 days',
      'Netflix renews tomorrow',
    ])
  })

  it('waits until 09:00 for a charge due today on a DST transition day', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    vi.setSystemTime(new Date(2026, 2, 8, 0, 30))
    useSubscriptionStore.setState({
      subscriptions: [{ ...subscription, next_payment_date: '2026-03-08' }],
    })
    useSettingsStore.setState({
      settings: { id: 'singleton', ...DEFAULT_SETTINGS },
    })
    const early = renderHook(() => useNotificationScheduler())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(sendNotificationMock).not.toHaveBeenCalled()
    early.unmount()
    vi.setSystemTime(new Date(2026, 2, 8, 9))
    renderHook(() => useNotificationScheduler())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(sendNotificationMock).toHaveBeenCalledExactlyOnceWith({
      title: 'Netflix renews today',
      body: '$15.99/mo',
    })
  })

  it('consolidates missed lead-day windows into one reminder on first startup', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    useSettingsStore.setState({ settings: { id: 'singleton', ...DEFAULT_SETTINGS } })
    renderHook(() => useNotificationScheduler())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000)
    })
    expect(sendNotificationMock).toHaveBeenCalledExactlyOnceWith({
      title: 'Netflix renews tomorrow',
      body: '$15.99/mo',
    })
  })

  it.each(['{}', 'null', '[null]', '[{"subId":"sub-1","date":"2026-10-22"}]'])(
    'tolerates legacy notification storage %s',
    async (stored) => {
      Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      localStorage.setItem('kessai-sent-notifications', stored)
      renderHook(() => useNotificationScheduler())
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3_000)
      })
      expect(sendNotificationMock).toHaveBeenCalledOnce()
      expect(error).not.toHaveBeenCalled()
      expect(JSON.parse(localStorage.getItem('kessai-sent-notifications')!)).toContainEqual({
        subId: 'sub-1',
        date: '2026-10-22',
        daysBefore: 1,
      })
    }
  )
})
