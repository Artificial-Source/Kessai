import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const SIDEBAR_KEY = 'subby-sidebar-collapsed'

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    <aside
      className={cn(
        'glass-sidebar border-border relative z-20 flex h-full shrink-0 flex-col border-r transition-[width] duration-200 ease-out',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className="flex items-center gap-3 overflow-hidden p-6">
        <img src="/icon.png" alt="Subby" className="h-8 w-8 shrink-0 object-contain" />
        <h1
          className={cn(
            'text-foreground font-[family-name:var(--font-heading)] text-xl font-bold tracking-tight whitespace-nowrap transition-[opacity,transform] duration-200',
            collapsed ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
          )}
        >
          Subby
        </h1>
      </div>

      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-2 px-4 py-4">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 overflow-hidden rounded-none px-4 py-3 font-[family-name:var(--font-mono)] text-sm',
                isActive
                  ? 'border-primary bg-primary/10 text-foreground border-l-[3px]'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground border-l-[3px] border-transparent'
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="h-5 w-5 shrink-0" />
                <span
                  className={cn(
                    'text-[13px] tracking-wide whitespace-nowrap transition-[opacity,transform] duration-200',
                    collapsed ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
                  )}
                  {...(isActive ? { 'aria-current': 'page' as const } : {})}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="border-border bg-card text-muted-foreground hover:text-foreground absolute top-20 -right-3 flex h-6 w-6 items-center justify-center rounded-full border transition-transform duration-200 hover:scale-110"
      >
        <span className={cn('transition-transform duration-200', collapsed && 'rotate-180')}>
          <ChevronLeft className="h-3 w-3" />
        </span>
      </button>
    </aside>
  )
}
