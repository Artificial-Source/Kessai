import { Outlet } from 'react-router-dom'
import { Sidebar } from './sidebar'

export function AppShell() {
  return (
    <div className="bg-background text-foreground flex h-full">
      <Sidebar />

      <main className="relative flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1320px] p-5 lg:p-8 xl:p-10">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
