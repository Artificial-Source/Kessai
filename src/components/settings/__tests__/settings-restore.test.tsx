import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useSettingsStore } from '@/stores/settings-store'
import { DEFAULT_SETTINGS, type Settings } from '@/types/settings'
import type * as ApiModule from '@/lib/api'

const { refresh, errorToast, invoke } = vi.hoisted(() => ({
  refresh: vi.fn(),
  errorToast: vi.fn(),
  invoke: vi.fn(),
}))
vi.mock('@/lib/refresh-app-data', () => ({ refreshAppData: refresh }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: errorToast } }))
vi.mock('@/hooks/use-settings', () => ({
  useSettings: () => ({
    settings: useSettingsStore((state) => state.settings),
    isLoading: false,
    error: null,
    setNotifications: vi.fn(),
    setNotificationDaysBefore: vi.fn(),
    setNotificationTime: vi.fn(),
    update: vi.fn(),
  }),
}))
vi.mock('@/lib/runtime', () => ({ isTauriRuntime: () => false }))
vi.mock('@/components/settings/data-management', () => ({
  DataManagement: ({ onDataChanged }: { onDataChanged: (restored?: boolean) => Promise<void> }) => (
    <>
      <button onClick={() => void onDataChanged(true)}>Restore now</button>
      <button onClick={() => void onDataChanged()}>Import now</button>
    </>
  ),
}))
vi.mock('@/components/categories/category-manager', () => ({ CategoryManager: () => null }))
vi.mock('@/components/tags/tag-manager', () => ({ TagManager: () => null }))
vi.mock('@/components/settings/card-manager', () => ({ CardManager: () => null }))
vi.mock('@/components/settings/notification-settings', () => ({ NotificationSettings: () => null }))
vi.mock('@/components/settings/motion-settings', () => ({ MotionSettings: () => null }))
vi.mock('@/components/settings/update-settings', () => ({ UpdateSettings: () => null }))
vi.mock('@/components/settings/private-web-access', () => ({ PrivateWebAccess: () => null }))
vi.mock('@/components/settings/autostart-settings', () => ({ AutostartSettings: () => null }))
vi.mock('@/components/settings/access-status', () => ({ AccessStatus: () => null }))

import { ThemeProvider } from '@/components/theme-provider'
import { SettingsPage } from '@/pages/settings'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.setItem('kessai-theme', 'dark')
  useSettingsStore.setState({
    settings: { id: 'settings', ...DEFAULT_SETTINGS, monthly_budget: 100 },
  })
  refresh.mockImplementation(async () => {
    useSettingsStore.setState({
      settings: { id: 'settings', ...DEFAULT_SETTINGS, theme: 'light', monthly_budget: 250 },
    })
  })
  invoke.mockImplementation(async (command: string, args?: { data: Partial<Settings> }) => {
    if (command !== 'update_settings') throw new Error(`Unexpected command: ${command}`)
    return { ...useSettingsStore.getState().settings, ...args?.data }
  })
})
afterEach(cleanup)

it('shows a theme picked in Settings at once and saves it to settings', async () => {
  render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Light' }))

  expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')
  expect(document.documentElement).toHaveClass('light')
  expect(localStorage.getItem('kessai-theme')).toBe('light')
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledExactlyOnceWith('update_settings', { data: { theme: 'light' } })
  )
})

it('refreshes all domains once and applies restored theme and budget', async () => {
  render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Restore now' }))
  await waitFor(() => {
    expect(screen.getByLabelText('Monthly budget')).toHaveValue(250)
    expect(document.documentElement).toHaveClass('light')
  })
  expect(refresh).toHaveBeenCalledOnce()
  expect(document.documentElement).toHaveClass('light')
  expect(localStorage.getItem('kessai-theme')).toBe('light')
  // The restored theme came from settings; it is not written back.
  expect(invoke).not.toHaveBeenCalled()
})

it('does not replace the local theme after a subscription-only import', async () => {
  render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Import now' }))
  await waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  expect(document.documentElement).toHaveClass('dark')
})

it('reports refresh failure as saved data, not a failed restore', async () => {
  refresh.mockRejectedValueOnce(new Error('Tags unavailable'))
  render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>
  )
  fireEvent.click(screen.getByRole('button', { name: 'Restore now' }))
  await waitFor(() =>
    expect(errorToast).toHaveBeenCalledWith('Data saved; refresh failed', {
      description: 'Tags unavailable',
    })
  )
})
