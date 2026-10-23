import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useSettingsStore } from '@/stores/settings-store'

export function useSettings() {
  const {
    settings,
    isLoading,
    error,
    fetch,
    update,
    setTheme,
    setCurrency,
    setNotifications,
    setNotificationAdvanceDays,
    setNotificationDaysBefore,
    setNotificationTime,
  } = useSettingsStore(
    useShallow((state) => ({
      settings: state.settings,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      update: state.update,
      setTheme: state.setTheme,
      setCurrency: state.setCurrency,
      setNotifications: state.setNotifications,
      setNotificationAdvanceDays: state.setNotificationAdvanceDays,
      setNotificationDaysBefore: state.setNotificationDaysBefore,
      setNotificationTime: state.setNotificationTime,
    }))
  )

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
    setNotificationAdvanceDays,
    setNotificationDaysBefore,
    setNotificationTime,
    refresh: fetch,
  }
}
