import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subs' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

/**
 * Phone/tablet navigation (below md). Docked to the bottom edge, opaque so scrolling
 * content never shows through, and padded for the home-indicator safe area. The shell
 * reserves `--bottom-bar-height` + safe area below the main content.
 */
export function BottomTabBar() {
  return (
    <nav
      aria-label="Mobile navigation"
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="mx-auto grid h-(--bottom-bar-height) max-w-md grid-cols-4">
        {tabs.map(({ to, icon: Icon, label }) => (
          <li key={to} className="flex">
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'group flex flex-1 flex-col items-center justify-center gap-1 transition-colors duration-150 focus-visible:outline-offset-[-4px]',
                  isActive ? 'text-foreground' : 'text-muted-foreground active:text-foreground'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-sm transition-colors duration-150',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'group-hover:bg-accent-muted'
                    )}
                  >
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <span className="type-label leading-none">{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
