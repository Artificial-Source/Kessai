import { useEffect } from 'react'
import { useSettingsStore } from '@/stores/settings-store'

export function useSettings() {
  const { settings, isLoading, error, fetch, update, setTheme, setCurrency, setNotifications } =
    useSettingsStore()

  useEffect(() => {
    fetch()
  }, [fetch])

  return {
    settings,
    isLoading,
    error,
    update,
    setTheme,
    setCurrency,
    setNotifications,
    refresh: fetch,
  }
}
