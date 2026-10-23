import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMotionSettings } from '@/hooks/use-motion-settings'
import { useSettingsStore } from '@/stores/settings-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import { ThemeProvider, useTheme } from '../theme-provider'

function ThemeControls() {
  const { theme, setTheme } = useTheme()
  return (
    <>
      <output aria-label="Selected theme">{theme}</output>
      <button onClick={() => setTheme('light')}>Use light theme</button>
    </>
  )
}

function MotionConsumer() {
  useMotionSettings()
  return null
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    useSettingsStore.setState({ settings: null, error: null })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('continues in memory when reading localStorage is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Storage is denied', 'SecurityError')
    })

    render(
      <ThemeProvider defaultTheme="dark">
        <ThemeControls />
      </ThemeProvider>
    )

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))
    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('light')
  })

  it('updates the active theme even when writing localStorage fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage is full', 'QuotaExceededError')
    })

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it('falls back to the supplied default for an invalid stored theme', () => {
    localStorage.setItem('kessai-theme', 'unexpected-theme')

    render(
      <ThemeProvider defaultTheme="light">
        <ThemeControls />
      </ThemeProvider>
    )

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('light')
  })

  it.each(['dark', 'light', 'system'] as const)('restores the valid stored %s theme', (theme) => {
    localStorage.setItem('kessai-theme', theme)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => Object.assign(new EventTarget(), { matches: false }))
    )

    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent(theme)
  })

  it('persists a chosen theme under the existing key', () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))

    expect(localStorage.getItem('kessai-theme')).toBe('light')
  })

  it('adopts the theme saved in settings when this device has never chosen one', () => {
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )
    expect(document.documentElement).toHaveClass('dark')

    act(() => {
      useSettingsStore.setState({
        settings: { id: 'singleton', ...DEFAULT_SETTINGS, theme: 'light' },
      })
    })

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('light')
    expect(document.documentElement).toHaveClass('light')
    expect(localStorage.getItem('kessai-theme')).toBe('light')
  })

  it("keeps this device's theme over the one saved in settings", () => {
    localStorage.setItem('kessai-theme', 'dark')
    render(
      <ThemeProvider>
        <ThemeControls />
      </ThemeProvider>
    )

    act(() => {
      useSettingsStore.setState({
        settings: { id: 'singleton', ...DEFAULT_SETTINGS, theme: 'light' },
      })
    })

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('dark')
    expect(document.documentElement).toHaveClass('dark')
  })

  it('does not adopt fallback settings from a failed load', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeControls />
      </ThemeProvider>
    )

    act(() => {
      useSettingsStore.setState({
        settings: { id: 'singleton', ...DEFAULT_SETTINGS },
        error: 'Kessai is not running',
      })
    })

    expect(screen.getByLabelText('Selected theme')).toHaveTextContent('light')
    expect(localStorage.getItem('kessai-theme')).toBeNull()
  })

  it('follows OS reduced motion before settings load and keeps honoring it after they load', () => {
    const media = Object.assign(new EventTarget(), { matches: true })
    // Like a MediaQueryListEvent: listeners read `matches` from the event itself.
    const setOsReduce = (matches: boolean) => {
      media.matches = matches
      media.dispatchEvent(Object.assign(new Event('change'), { matches }))
    }
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => media)
    )

    render(
      <ThemeProvider>
        <MotionConsumer />
      </ThemeProvider>
    )

    expect(document.documentElement).toHaveClass('reduce-motion')
    act(() => setOsReduce(false))
    expect(document.documentElement).not.toHaveClass('reduce-motion')
    act(() => setOsReduce(true))
    expect(document.documentElement).toHaveClass('reduce-motion')

    // The in-app switch only adds reduction; it never overrides the OS preference.
    act(() => {
      useSettingsStore.setState({
        settings: { id: 'singleton', ...DEFAULT_SETTINGS, reduce_motion: false },
      })
    })
    const root = document.documentElement
    expect(root).toHaveClass('reduce-motion')
    expect(root.style.getPropertyValue('--animation-duration')).toBe('0s')
    expect(root.style.getPropertyValue('--transition-duration')).toBe('0s')
    expect(root.style.getPropertyValue('--animation-speed-multiplier')).toBe('0')
    act(() => setOsReduce(false))
    expect(root).not.toHaveClass('reduce-motion')
  })

  it('does not override saved reduced motion when settings are already loaded', () => {
    useSettingsStore.setState({
      settings: { id: 'singleton', ...DEFAULT_SETTINGS, reduce_motion: true },
    })
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => Object.assign(new EventTarget(), { matches: false }))
    )

    render(
      <ThemeProvider>
        <MotionConsumer />
      </ThemeProvider>
    )

    expect(document.documentElement).toHaveClass('reduce-motion')
  })
})
