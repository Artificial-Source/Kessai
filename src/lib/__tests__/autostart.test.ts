import { beforeEach, describe, expect, it, vi } from 'vitest'

const { isEnabledMock, enableMock, disableMock } = vi.hoisted(() => ({
  isEnabledMock: vi.fn(),
  enableMock: vi.fn(),
  disableMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-autostart', () => ({
  isEnabled: isEnabledMock,
  enable: enableMock,
  disable: disableMock,
}))

import { getAutostartEnabled, mutateAutostartEnabled } from '../autostart'

describe('autostart module', () => {
  beforeEach(() => {
    isEnabledMock.mockReset().mockResolvedValue(false)
    enableMock.mockReset().mockResolvedValue(undefined)
    disableMock.mockReset().mockResolvedValue(undefined)
  })

  it('reads the current OS autostart state', async () => {
    isEnabledMock.mockResolvedValue(true)

    await expect(getAutostartEnabled()).resolves.toBe(true)
    expect(isEnabledMock).toHaveBeenCalledOnce()
  })

  it('enables without a verification read', async () => {
    await mutateAutostartEnabled(true)

    expect(enableMock).toHaveBeenCalledOnce()
    expect(disableMock).not.toHaveBeenCalled()
    expect(isEnabledMock).not.toHaveBeenCalled()
  })

  it('disables without a verification read', async () => {
    await mutateAutostartEnabled(false)

    expect(disableMock).toHaveBeenCalledOnce()
    expect(enableMock).not.toHaveBeenCalled()
    expect(isEnabledMock).not.toHaveBeenCalled()
  })
})
