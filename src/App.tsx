import { lazy, Suspense, useEffect, type CSSProperties } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { ErrorBoundary } from '@/components/error-boundary'
import { RouteErrorBoundary } from '@/components/route-error-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
import { useUpdateStore } from '@/stores/update-store'
import { useTrayBadge } from '@/hooks/use-tray-badge'
import { logger } from '@/lib/logger'
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
const NotFoundPage = lazy(() =>
  import('@/pages/not-found').then((m) => ({ default: m.NotFoundPage }))
)

const toasterStyle = {
  '--normal-bg': 'var(--color-surface-elevated)',
  '--normal-border': 'var(--color-border-hover)',
  '--normal-text': 'var(--color-foreground)',
  '--border-radius': 'var(--radius-md)',
  fontFamily: 'var(--font-sans)',
} as CSSProperties

export default function App() {
  const initializeUpdater = useUpdateStore((state) => state.initialize)
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates)

  // Keep system tray badge in sync with subscriptions
  useTrayBadge()

  // Log app startup
  useEffect(() => {
    logger.info('app', 'Kessai started')
  }, [])

  useEffect(() => {
    void initializeUpdater().then(() => checkForUpdates({ silent: true }))
  }, [checkForUpdates, initializeUpdater])

  return (
    <ThemeProvider defaultTheme="dark" storageKey="kessai-theme">
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
                <Route
                  path="*"
                  element={
                    <RouteErrorBoundary>
                      <NotFoundPage />
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
        offset={{ bottom: 'var(--toast-offset-bottom)', right: '1.5rem' }}
        mobileOffset={{ bottom: 'var(--toast-offset-bottom)', left: '0.75rem', right: '0.75rem' }}
        gap={8}
        visibleToasts={3}
        style={toasterStyle}
      />
    </ThemeProvider>
  )
}
