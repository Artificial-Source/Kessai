import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, BarChart3, Settings } from 'lucide-react'
import { Search } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'

const SIDEBAR_COLLAPSED_WIDTH = 72

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export function Sidebar() {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette)

  return (
    <aside
      className="glass-sidebar shadow-ambient bg-surface-highest/20 relative z-30 hidden h-screen flex-col overflow-visible md:flex"
      style={{
        width: SIDEBAR_COLLAPSED_WIDTH,
        minWidth: SIDEBAR_COLLAPSED_WIDTH,
      }}
    >
      {/* Header */}
      <div className="flex h-14 w-full shrink-0 items-center justify-center">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
          <img src="/kessai-logo.png" alt="Kessai" className="h-full w-full object-contain" />
        </div>
      </div>

      {/* Search hint */}
      <div className="flex w-full shrink-0 justify-center pt-2 pb-0">
        <button
          onClick={openCommandPalette}
          className="text-muted-foreground hover:text-foreground flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] p-0 transition-colors hover:border-[var(--color-border)]"
          title="Search (⌘K)"
          aria-label="Search (⌘K)"
        >
          <Search size={14} className="shrink-0" />
        </button>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main navigation"
        className="flex w-full flex-1 flex-col items-center gap-2 overflow-visible py-4"
      >
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `text-muted-foreground hover:text-foreground group relative mx-auto flex h-10 w-10 items-center justify-center rounded-md p-0 text-sm font-medium transition-all duration-150 ease-in-out hover:bg-[var(--color-subtle-overlay)] ${isActive ? 'text-foreground bg-[var(--color-accent-muted)]' : ''}`
            }
            title={label}
          >
            <Icon size={18} className="shrink-0" />
            <span className="text-foreground pointer-events-none absolute top-1/2 left-[calc(100%+8px)] z-[200] -translate-y-1/2 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] px-[10px] py-1 font-[family-name:var(--font-mono)] text-[11px] whitespace-nowrap opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.3)] transition-opacity duration-150 ease-in-out group-hover:opacity-100">
              {label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
