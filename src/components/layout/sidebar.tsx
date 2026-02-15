import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AppLogo } from './app-logo'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        'glass-sidebar relative z-20 flex h-full shrink-0 flex-col transition-[width] duration-200 ease-out',
        collapsed ? 'w-20' : 'w-64'
      )}
    >
      <div className={cn('overflow-hidden px-4 pt-5 pb-3', collapsed ? 'px-3' : 'px-4')}>
        <AppLogo
          compact={collapsed}
          className={cn('transition-all duration-200', collapsed && 'justify-center')}
        />
      </div>

      <nav aria-label="Main navigation" className="flex flex-1 flex-col gap-1.5 px-3 py-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2.5 text-sm font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out',
                isActive
                  ? 'border-primary/45 bg-primary/12 text-foreground shadow-[0_8px_18px_color-mix(in_srgb,var(--color-primary)_15%,transparent)]'
                  : 'text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground border-transparent'
              )
            }
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span
              className={cn(
                'whitespace-nowrap transition-[opacity,transform] duration-200',
                collapsed ? 'translate-x-4 opacity-0' : 'translate-x-0 opacity-100'
              )}
            >
              {label}
            </span>
          </NavLink>
        ))}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="border-border bg-card text-muted-foreground hover:text-foreground absolute top-7 -right-3 flex h-7 w-7 items-center justify-center rounded-full border shadow-md transition-transform duration-200 hover:scale-105"
      >
        <span className={cn('transition-transform duration-200', collapsed && 'rotate-180')}>
          <ChevronLeft className="h-3 w-3" />
        </span>
      </button>
    </aside>
  )
}
