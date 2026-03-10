import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'
import { useMotionSettings } from '@/hooks/use-motion-settings'

export function AppShell() {
  useMotionSettings()

  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <Sidebar />

      <main className="grid-bg flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
