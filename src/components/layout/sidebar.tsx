import { NavLink } from 'react-router-dom'
import { LayoutDashboard, CreditCard, Calendar, Settings, Search, Keyboard } from 'lucide-react'
import { useUiStore } from '@/stores/ui-store'
import { modifierKeyLabel } from '@/lib/keyboard'
import { cn } from '@/lib/utils'
import kessaiLogo from '@/assets/kessai-logo.svg'

const SIDEBAR_WIDTH = 72

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', shortcut: '1' },
  { to: '/subscriptions', icon: CreditCard, label: 'Subscriptions', shortcut: '2' },
  { to: '/calendar', icon: Calendar, label: 'Calendar', shortcut: '3' },
  { to: '/settings', icon: Settings, label: 'Settings', shortcut: '4' },
]

const railItemClassName =
  'group text-muted-foreground hover:text-foreground relative flex size-10 items-center justify-center rounded-md transition-colors duration-150 hover:bg-accent-muted pointer-coarse:size-11'

/** Hover/focus label for an icon-only rail item. The text also serves as its accessible name. */
function RailTooltip({ label, hint }: { label: string; hint?: string }) {
  return (
    <span className="border-border-hover bg-popover text-popover-foreground pointer-events-none absolute top-1/2 left-[calc(100%+10px)] z-[200] flex -translate-y-1/2 items-center gap-2 rounded-sm border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[11px] whitespace-nowrap opacity-0 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45)] transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
      {label}
      {hint ? (
        <span aria-hidden="true" className="text-muted-foreground">
          {hint}
        </span>
      ) : null}
    </span>
  )
}

export function Sidebar() {
  const openCommandPalette = useUiStore((s) => s.openCommandPalette)
  const openShortcutsDialog = useUiStore((s) => s.openShortcutsDialog)
  const mod = modifierKeyLabel()

  return (
    <aside
      className="glass-sidebar relative z-30 hidden h-full shrink-0 flex-col items-center md:flex"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div className="flex h-14 w-full shrink-0 items-center justify-center">
        <img src={kessaiLogo} alt="Kessai" className="size-8 object-contain" />
      </div>

      <button
        type="button"
        onClick={openCommandPalette}
        className={cn(railItemClassName, 'border-input-border bg-input mt-2 border')}
        aria-label="Search"
        aria-keyshortcuts={mod === '⌘' ? 'Meta+K' : 'Control+K'}
      >
        <Search size={16} className="shrink-0" aria-hidden="true" />
        <RailTooltip label="Search" hint={`${mod} K`} />
      </button>

      <nav aria-label="Main navigation" className="flex w-full flex-1 flex-col items-center py-4">
        <ul className="flex flex-col items-center gap-2">
          {navItems.map(({ to, icon: Icon, label, shortcut }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                aria-keyshortcuts={shortcut}
                className={({ isActive }) =>
                  cn(
                    railItemClassName,
                    isActive &&
                      'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                  )
                }
              >
                <Icon size={18} className="shrink-0" aria-hidden="true" />
                <RailTooltip label={label} hint={shortcut} />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <button
        type="button"
        onClick={openShortcutsDialog}
        className={cn(railItemClassName, 'mb-4')}
        aria-label="Keyboard shortcuts"
        aria-keyshortcuts="?"
      >
        <Keyboard size={16} className="shrink-0" aria-hidden="true" />
        <RailTooltip label="Shortcuts" hint="?" />
      </button>
    </aside>
  )
}
