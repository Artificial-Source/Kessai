import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useTrayBadge } from '../use-tray-badge'

const { apiInvokeMock, warnMock } = vi.hoisted(() => ({
  apiInvokeMock: vi.fn(),
  warnMock: vi.fn(),
}))

vi.mock('@/lib/api', () => ({ apiInvoke: apiInvokeMock }))
vi.mock('@/lib/logger', () => ({ logger: { warn: warnMock } }))

describe('useTrayBadge', () => {
  beforeEach(() => {
    Reflect.deleteProperty(window, '__TAURI__')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    apiInvokeMock.mockReset().mockResolvedValue(undefined)
    warnMock.mockReset()
    useSubscriptionStore.setState({ subscriptions: [] })
  })

  afterEach(() => {
    cleanup()
    Reflect.deleteProperty(window, '__TAURI__')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  })

  it('does not invoke desktop commands or log failures in a browser', async () => {
    renderHook(() => useTrayBadge())
    await act(async () => {
      useSubscriptionStore.setState({ subscriptions: [] })
    })

    expect(apiInvokeMock).not.toHaveBeenCalled()
    expect(warnMock).not.toHaveBeenCalled()
  })

  it.each(['__TAURI_INTERNALS__', '__TAURI__'])(
    'refreshes the badge with the %s desktop marker',
    async (marker) => {
      Object.defineProperty(window, marker, { configurable: true, value: {} })
      renderHook(() => useTrayBadge())
      await act(async () => {
        useSubscriptionStore.setState({ subscriptions: [] })
      })

      expect(apiInvokeMock).toHaveBeenCalledTimes(2)
      expect(apiInvokeMock).toHaveBeenLastCalledWith('update_tray_badge')
      expect(warnMock).not.toHaveBeenCalled()
    }
  )

  it('logs desktop failures once instead of swallowing them on every update', async () => {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    apiInvokeMock.mockRejectedValue(new Error('Tray unavailable'))
    renderHook(() => useTrayBadge())
    await act(async () => {
      await Promise.resolve()
    })
    await act(async () => {
      useSubscriptionStore.setState({ subscriptions: [] })
    })

    expect(apiInvokeMock).toHaveBeenCalledTimes(2)
    expect(warnMock).toHaveBeenCalledTimes(1)
    expect(warnMock).toHaveBeenCalledWith('tray', expect.stringContaining('Tray unavailable'))
  })
})
