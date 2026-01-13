import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'

export function AppShell() {
  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto max-w-6xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
