import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useSettingsStore } from '@/stores/settings-store'
import type { Theme } from '@/types/settings'

type ResolvedTheme = Exclude<Theme, 'system'>

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  /** The chosen theme; `system` follows the OS. */
  theme: Theme
  /** The theme on screen: `system` resolved through the OS color scheme. */
  resolvedTheme: ResolvedTheme
  /** Shows a theme, remembers it on this device, and saves it to settings. */
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

function readStoredTheme(storageKey: string): Theme | null {
  try {
    const stored = localStorage.getItem(storageKey)
    return stored === 'dark' || stored === 'light' || stored === 'system' ? stored : null
  } catch {
    return null
  }
}

/**
 * The renderer's source of truth for the theme. This device's copy (localStorage) is read
 * before the first paint, so a launch never flashes the wrong theme. Settings keep a copy as
 * well: every choice is saved there, and a device that has never chosen adopts the saved
 * theme once settings load.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'kessai-theme',
}: ThemeProviderProps) {
  const [storedTheme] = useState(() => readStoredTheme(storageKey))
  const [theme, setThemeState] = useState<Theme>(storedTheme ?? defaultTheme)
  // Synced from the OS by the layout effect below, before paint, whenever the choice is `system`.
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>('dark')
  const resolvedTheme = theme === 'system' ? systemTheme : theme
  // Whether this device holds its own theme (stored, chosen, or adopted from settings).
  const hasDeviceTheme = useRef(storedTheme !== null)
  // Fallback settings from a failed load are nobody's choice, so they are never adopted.
  const savedTheme = useSettingsStore((state) => (state.error ? undefined : state.settings?.theme))
  const hasMotionSettings = useSettingsStore((state) => state.settings !== null)

  const rememberTheme = useCallback(
    (next: Theme) => {
      hasDeviceTheme.current = true
      setThemeState(next)
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // Theme changes still work in memory when storage is unavailable.
      }
    },
    [storageKey]
  )

  useEffect(() => {
    if (!savedTheme || hasDeviceTheme.current) return
    if (savedTheme !== theme) rememberTheme(savedTheme)
  }, [savedTheme, theme, rememberTheme])

  // Follow the OS color scheme while the choice is `system`.
  useLayoutEffect(() => {
    if (theme !== 'system') return
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setSystemTheme(mediaQuery.matches ? 'dark' : 'light')
    sync()
    mediaQuery.addEventListener('change', sync)
    return () => mediaQuery.removeEventListener('change', sync)
  }, [theme])

  // Layout effect: the theme class must land before the first paint, or a light-theme user
  // sees one frame of dark tokens on every launch.
  useLayoutEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    const root = document.documentElement

    // Saved settings own motion once loaded (useMotionSettings). Marking the root lifts the
    // CSS `prefers-reduced-motion` baseline in globals.css so the app setting can override it.
    if (hasMotionSettings) {
      root.dataset.motionSource = 'settings'
      return () => {
        delete root.dataset.motionSource
      }
    }

    // Until then, OS motion is the startup default.
    if (typeof window.matchMedia !== 'function') return

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const applyMotionPreference = () => {
      root.classList.toggle('reduce-motion', mediaQuery.matches)
    }
    applyMotionPreference()
    mediaQuery.addEventListener('change', applyMotionPreference)

    return () => {
      mediaQuery.removeEventListener('change', applyMotionPreference)
      root.classList.remove('reduce-motion')
    }
  }, [hasMotionSettings])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme: (next: Theme) => {
        rememberTheme(next)
        // The store logs and rolls back a failed save; this device keeps the theme either way.
        const { settings, setTheme: saveTheme } = useSettingsStore.getState()
        if (settings && settings.theme !== next) void saveTheme(next).catch(() => undefined)
      },
    }),
    [theme, resolvedTheme, rememberTheme]
  )

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
