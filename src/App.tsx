import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { ErrorBoundary } from '@/components/error-boundary'
import { AppShell } from '@/components/layout/app-shell'
import { LoadingSpinner } from '@/components/ui/loading-spinner'
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
  return (
    <ThemeProvider defaultTheme="dark" storageKey="subby-theme">
      <ErrorBoundary>
        <BrowserRouter>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/subscriptions" element={<Subscriptions />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
            </Routes>
          </Suspense>
        </BrowserRouter>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--color-card)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-card-foreground)',
          },
        }}
      />
    </ThemeProvider>
  )
}
