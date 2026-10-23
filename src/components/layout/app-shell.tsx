import { lazy, Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { BottomTabBar } from './bottom-tab-bar'
import { WindowTitlebar } from './window-titlebar'
import { useMotionSettings } from '@/hooks/use-motion-settings'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useNotificationScheduler } from '@/hooks/use-notification-scheduler'
import { KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts-dialog'
import { UpdateAvailableDialog } from '@/components/ui/update-available-dialog'
import { CommandPalette } from '@/components/command-palette/command-palette'

// One dialog for the whole app: N, the command palette, the calendar, and the dashboard all
// open it through the UI store, so it must exist on every route. Loaded off the critical path.
const SubscriptionDialog = lazy(() =>
  import('@/components/subscriptions/subscription-dialog').then((m) => ({
    default: m.SubscriptionDialog,
  }))
)

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/subscriptions': 'Subscriptions',
  '/calendar': 'Calendar',
  '/settings': 'Settings',
}

/** Any open Radix modal (dialogs, the palette, confirmations) owns focus while it is up. */
const OPEN_MODAL = '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'

export function AppShell() {
  useMotionSettings()
  useKeyboardShortcuts()
  useNotificationScheduler()

  const { pathname } = useLocation()
  const previousPathRef = useRef(pathname)

  useEffect(() => {
    const page = ROUTE_TITLES[pathname] ?? 'Page not found'
    document.title = `${page} · Kessai`
  }, [pathname])

  // After in-app navigation, move focus to the new page's h1 so screen readers start at
  // the top of the new content (initial load keeps the browser's default focus). A lazy
  // page may still be loading: focus `main` first, then the h1 once it renders.
  // An open modal (the subscription editor survives route changes, e.g. browser Back while
  // editing) owns focus: moving it out would make the dialog's focus trap pull it back with
  // select-all on the first field, and the next keystroke would wipe the draft.
  useEffect(() => {
    if (previousPathRef.current === pathname) return
    previousPathRef.current = pathname
    const main = document.getElementById('main-content')
    if (!main) return

    const focusHeading = () => {
      const heading = main.querySelector<HTMLElement>('h1')
      if (!heading) return false
      const active = document.activeElement
      // Never pull focus away from something the user already moved to inside the page.
      if (active && active !== main && active !== document.body && main.contains(active))
        return true
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
      return true
    }

    let observer: MutationObserver | undefined
    const frame = requestAnimationFrame(() => {
      if (document.querySelector(OPEN_MODAL) || focusHeading()) return
      main.focus({ preventScroll: true })
      observer = new MutationObserver(() => {
        if (document.querySelector(OPEN_MODAL) || focusHeading()) observer?.disconnect()
      })
      observer.observe(main, { childList: true, subtree: true })
    })
    const giveUp = window.setTimeout(() => observer?.disconnect(), 5000)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(giveUp)
      observer?.disconnect()
    }
  }, [pathname])

  return (
    <div className="bg-background flex h-dvh flex-col overflow-hidden">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground fixed top-2 left-2 z-[100] -translate-y-[200%] rounded-md px-4 py-2 text-sm font-medium transition-transform duration-150 focus-visible:translate-y-0"
      >
        Skip to main content
      </a>

      <WindowTitlebar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />

        <main
          id="main-content"
          tabIndex={-1}
          className="desktop-scroll-container relative z-0 flex-1 overflow-y-auto outline-none"
        >
          <div className="desktop-scroll-content mx-auto max-w-7xl p-4 pb-[calc(var(--bottom-bar-height)+env(safe-area-inset-bottom)+1.5rem)] md:p-6">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomTabBar />
      <KeyboardShortcutsDialog />
      <UpdateAvailableDialog />
      <CommandPalette />
      <Suspense fallback={null}>
        <SubscriptionDialog />
      </Suspense>
    </div>
  )
}
