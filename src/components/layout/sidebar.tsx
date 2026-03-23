import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  CreditCard,
  Calendar,
  Settings,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useUiStore } from '@/stores/ui-store'

const SIDEBAR_WIDTH = 240
const SIDEBAR_COLLAPSED_WIDTH = 60

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

const SIDEBAR_KEY = 'subby-sidebar-collapsed'

export function Sidebar() {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === 'true'
    } catch {
      return false
    }
  })

  const isDesktop = useMediaQuery('(min-width: 1024px)')

  // On tablet (md to lg), always show collapsed; on desktop, respect user preference
  const isCollapsed = !isDesktop || collapsed

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(collapsed))
    } catch {
      // ignore
    }
  }, [collapsed])

  return (
    <aside
      className="glass-sidebar hidden h-screen flex-col md:flex"
      style={{
        width: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        minWidth: isCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div
        className={cn(
          'flex h-14 items-center',
          isCollapsed ? 'justify-center px-0' : 'justify-between px-4'
        )}
      >
        {isCollapsed ? (
          <img
            src="/icon-transparent.png"
            alt="Subby"
            className="h-7 w-7 shrink-0 object-contain"
          />
        ) : (
          <div className="flex items-center gap-2 overflow-hidden">
            <img
              src="/icon-transparent.png"
              alt="Subby"
              className="h-7 w-7 shrink-0 object-contain"
            />
            <span className="gradient-text font-heading text-lg font-bold tracking-tight whitespace-nowrap">
              Subby
            </span>
          </div>
        )}
        {isDesktop && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1.5 hover:bg-[var(--color-subtle-overlay)]"
          >
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>
        )}
      </div>

      {/* Search hint */}
      <div className="px-2 pt-1 pb-0">
        <button
          onClick={openCommandPalette}
          className={cn(
            'text-muted-foreground hover:text-foreground flex w-full items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-input)] py-1.5 text-xs transition-colors hover:border-[var(--color-border)]',
            isCollapsed ? 'justify-center px-0' : 'px-2.5'
          )}
          title="Search (⌘K)"
        >
          <Search size={14} className="shrink-0" />
          {!isCollapsed && (
            <>
              <span className="font-[family-name:var(--font-sans)] flex-1 text-left">Search...</span>
              <kbd className="font-[family-name:var(--font-mono)] text-muted-foreground rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] tracking-widest">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Main navigation" className="flex-1 space-y-0.5 px-2 py-2">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'sidebar-link',
                isCollapsed && 'sidebar-link-collapsed',
                isActive && (isCollapsed ? 'sidebar-link-active-collapsed' : 'sidebar-link-active')
              )
            }
            title={isCollapsed ? label : undefined}
          >
            <Icon size={18} className="shrink-0" />
            <span
              className={cn(
                'whitespace-nowrap transition-opacity duration-200',
                isCollapsed ? 'w-0 overflow-hidden opacity-0' : 'opacity-100'
              )}
            >
              {label}
            </span>
            {isCollapsed && (
              <span className="sidebar-tooltip">{label}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
