import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings, ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useUiStore } from '@/stores/ui-store'
import { Button } from '@/components/ui/button'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore()

  return (
    <aside
      className={cn(
        'relative flex flex-col border-r border-white/10 bg-white/5 backdrop-blur-xl transition-all duration-300',
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className={cn('flex items-center gap-3 p-4', sidebarCollapsed && 'justify-center')}>
        <div className="from-aurora-purple to-aurora-blue flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br">
          <span className="text-lg font-bold text-white">S</span>
        </div>
        {!sidebarCollapsed && (
          <div>
            <h1 className="gradient-text text-xl font-bold">Subby</h1>
            <p className="text-muted-foreground text-xs">Know where your money flows</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'text-foreground bg-white/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
                sidebarCollapsed && 'justify-center px-2'
              )
            }
            title={sidebarCollapsed ? label : undefined}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!sidebarCollapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <Button
        variant="ghost"
        size="icon"
        onClick={toggleSidebar}
        className="bg-background absolute top-20 -right-3 h-6 w-6 rounded-full border border-white/10"
      >
        <ChevronLeft
          className={cn('h-4 w-4 transition-transform', sidebarCollapsed && 'rotate-180')}
        />
      </Button>
    </aside>
  )
}
