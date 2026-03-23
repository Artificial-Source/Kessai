import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { BottomTabBar } from './bottom-tab-bar'
import { useMotionSettings } from '@/hooks/use-motion-settings'
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts'
import { useNotificationScheduler } from '@/hooks/use-notification-scheduler'
import { KeyboardShortcutsDialog } from '@/components/ui/keyboard-shortcuts-dialog'
import { CommandPalette } from '@/components/command-palette/command-palette'

export function AppShell() {
  useMotionSettings()
  useKeyboardShortcuts()
  useNotificationScheduler()

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <Sidebar />

      <main className="grid-bg flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-4 pb-24 md:p-6 md:pb-6">
          <Outlet />
        </div>
      </main>

      <BottomTabBar />
      <KeyboardShortcutsDialog />
      <CommandPalette />
    </div>
  )
}
