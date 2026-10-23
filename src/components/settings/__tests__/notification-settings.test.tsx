import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Settings } from '@/types/settings'

const { isTauriRuntimeMock } = vi.hoisted(() => ({ isTauriRuntimeMock: vi.fn() }))
vi.mock('@/lib/runtime', () => ({ isTauriRuntime: isTauriRuntimeMock }))
vi.mock('@tauri-apps/plugin-notification', () => ({
  isPermissionGranted: vi.fn(),
  requestPermission: vi.fn(),
  sendNotification: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { NotificationSettings } from '../notification-settings'

const HINT =
  'Reminders arrive as desktop notifications from the Kessai app, not this browser, so there’s nothing to test here.'

const settings: Settings = {
  id: 'singleton',
  ...DEFAULT_SETTINGS,
  notification_enabled: true,
  notification_days_before: [1, 3],
}

function renderSettings(overrides: Partial<Settings> = {}) {
  render(
    <NotificationSettings
      settings={{ ...settings, ...overrides }}
      onToggle={vi.fn().mockResolvedValue(undefined)}
      onDaysBeforeChange={vi.fn().mockResolvedValue(undefined)}
      onTimeChange={vi.fn().mockResolvedValue(undefined)}
    />
  )
}

beforeEach(() => {
  isTauriRuntimeMock.mockReset()
})

afterEach(cleanup)

describe('NotificationSettings', () => {
  it('replaces Send test with a hint in the browser, where it cannot work', () => {
    isTauriRuntimeMock.mockReturnValue(false)
    renderSettings()

    expect(screen.queryByRole('button', { name: /Send test/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Test notification')).not.toBeInTheDocument()
    expect(screen.getByText(HINT)).toBeInTheDocument()
  })

  it('offers Send test in the desktop app', () => {
    isTauriRuntimeMock.mockReturnValue(true)
    renderSettings()

    expect(screen.getByRole('button', { name: /Send test/ })).toBeInTheDocument()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })

  it('shows neither while reminders are off', () => {
    isTauriRuntimeMock.mockReturnValue(false)
    renderSettings({ notification_enabled: false })

    expect(screen.queryByRole('button', { name: /Send test/ })).not.toBeInTheDocument()
    expect(screen.queryByText(HINT)).not.toBeInTheDocument()
  })
})
