import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { useSettingsStore } from '@/stores/settings-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS, type Settings, type Theme } from '@/types/settings'
import { CommandPalette } from '../command-palette'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', () => ({ apiInvoke: invoke }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

function renderPalette({ device, saved }: { device: Theme; saved: Theme }) {
  localStorage.setItem('kessai-theme', device)
  useSettingsStore.setState({ settings: { id: 'singleton', ...DEFAULT_SETTINGS, theme: saved } })
  useUiStore.setState({ commandPaletteOpen: true })
  render(
    <MemoryRouter>
      <ThemeProvider>
        <CommandPalette />
      </ThemeProvider>
    </MemoryRouter>
  )
}

describe('CommandPalette Toggle Theme', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
    invoke.mockReset().mockImplementation(async (command: string, args?: unknown) => {
      if (command === 'list_subscriptions') return []
      if (command === 'update_settings') {
        const { data } = args as { data: Partial<Settings> }
        return { ...useSettingsStore.getState().settings, ...data }
      }
      throw new Error(`Unexpected command: ${command}`)
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.className = ''
    useSettingsStore.setState({ settings: null, error: null })
    useUiStore.setState({ commandPaletteOpen: false })
  })

  it('flips the theme on screen and saves it to settings', async () => {
    renderPalette({ device: 'dark', saved: 'dark' })
    expect(document.documentElement).toHaveClass('dark')

    fireEvent.click(screen.getByRole('option', { name: /Toggle Theme/ }))

    expect(document.documentElement).toHaveClass('light')
    expect(document.documentElement).not.toHaveClass('dark')
    expect(localStorage.getItem('kessai-theme')).toBe('light')
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('update_settings', { data: { theme: 'light' } })
    )
    expect(useSettingsStore.getState().settings?.theme).toBe('light')
    expect(useUiStore.getState().commandPaletteOpen).toBe(false)
  })

  it('toggles away from what a system theme shows, not from the word "system"', async () => {
    // The OS prefers light, so `system` is painted light and the toggle goes to dark.
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => Object.assign(new EventTarget(), { matches: false }))
    )
    renderPalette({ device: 'system', saved: 'system' })
    expect(document.documentElement).toHaveClass('light')

    fireEvent.click(screen.getByRole('option', { name: /Toggle Theme/ }))

    expect(document.documentElement).toHaveClass('dark')
    expect(localStorage.getItem('kessai-theme')).toBe('dark')
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('update_settings', { data: { theme: 'dark' } })
    )
  })
})
