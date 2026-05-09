import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { BottomTabBar } from './bottom-tab-bar'
import { WindowTitlebar } from './window-titlebar'
import { useMotionSettings } from '@/hooks/use-motion-settings'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useNotificationScheduler } from '@/hooks/use-notification-scheduler'
import { KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts-dialog'
import { UpdateAvailableDialog } from '@/components/ui/update-available-dialog'
import { CommandPalette } from '@/components/command-palette/command-palette'

export function AppShell() {
  useMotionSettings()
  useKeyboardShortcuts()
  useNotificationScheduler()

  return (
    <div className="bg-background flex h-screen flex-col overflow-hidden">
      {/* Skip to main content link for keyboard navigation */}
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground fixed top-0 left-1/2 z-[100] -translate-x-1/2 -translate-y-full rounded-b-lg px-4 py-2 font-[family-name:var(--font-sans)] text-sm font-medium transition-transform focus:translate-y-0"
      >
        Skip to main content
      </a>

      <WindowTitlebar />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar />

        <main
          id="main-content"
          className="grid-bg desktop-scroll-container relative z-0 flex-1 overflow-y-auto"
        >
          <div className="desktop-scroll-content mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-6">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomTabBar />
      <KeyboardShortcutsDialog />
      <UpdateAvailableDialog />
      <CommandPalette />
    </div>
  )
}
