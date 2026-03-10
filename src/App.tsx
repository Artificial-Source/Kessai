import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { ErrorBoundary } from '@/components/error-boundary'
import { RouteErrorBoundary } from '@/components/route-error-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { preloadRates } from '@/lib/exchange-rates'
import type { CurrencyCode } from '@/lib/currency'
import '@/styles/globals.css'

const Dashboard = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.Dashboard })))
const Subscriptions = lazy(() =>
  import('@/pages/subscriptions').then((m) => ({ default: m.Subscriptions }))
)
const CalendarPage = lazy(() =>
  import('@/pages/calendar').then((m) => ({ default: m.CalendarPage }))
)
const SettingsPage = lazy(() =>
  import('@/pages/settings').then((m) => ({ default: m.SettingsPage }))
)

export default function App() {
  // Preload exchange rates on startup for multi-currency support
  useEffect(() => {
    const unsubSettings = useSettingsStore.subscribe((state) => state.settings)
    const unsubSubs = useSubscriptionStore.subscribe((state) => state.subscriptions)

    const loadRates = () => {
      const settings = useSettingsStore.getState().settings
      const subs = useSubscriptionStore.getState().subscriptions
      const currencies = new Set<CurrencyCode>()
      currencies.add((settings?.currency || 'USD') as CurrencyCode)
      for (const sub of subs) {
        if (sub.currency) currencies.add(sub.currency as CurrencyCode)
      }
      if (currencies.size > 1) {
        preloadRates([...currencies])
      }
    }

    // Initial load after a short delay to let stores hydrate
    const timer = setTimeout(loadRates, 500)

    return () => {
      clearTimeout(timer)
      unsubSettings()
      unsubSubs()
    }
  }, [])

  return (
    <ThemeProvider defaultTheme="dark" storageKey="subby-theme">
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route
                  path="/"
                  element={
                    <RouteErrorBoundary>
                      <Dashboard />
                    </RouteErrorBoundary>
                  }
                />
                <Route
                  path="/subscriptions"
                  element={
                    <RouteErrorBoundary>
                      <Subscriptions />
                    </RouteErrorBoundary>
                  }
                />
                <Route
                  path="/calendar"
                  element={
                    <RouteErrorBoundary>
                      <CalendarPage />
                    </RouteErrorBoundary>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <RouteErrorBoundary>
                      <SettingsPage />
                    </RouteErrorBoundary>
                  }
                />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-foreground)',
          },
        }}
      />
    </ThemeProvider>
  )
}
