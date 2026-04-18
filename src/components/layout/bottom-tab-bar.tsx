import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subs' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function BottomTabBar() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pt-1 pb-3 md:hidden"
    >
      <div className="border-border bg-surface-elevated/80 shadow-ambient-sm flex w-full max-w-md items-center justify-around rounded-xl border px-2 py-1.5">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-0.5 rounded-lg px-4 py-1.5 transition-colors duration-150',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground active:text-foreground hover:bg-accent-muted'
              )
            }
          >
            <Icon size={18} />
            <span className="font-[family-name:var(--font-mono)] text-[9px] font-normal tracking-[1.5px] uppercase">
              {label}
            </span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
