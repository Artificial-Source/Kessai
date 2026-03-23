import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  LayoutDashboard,
  CreditCard,
  Calendar,
  Settings,
  Plus,
  SunMoon,
  ArrowRight,
} from 'lucide-react'
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useUiStore } from '@/stores/ui-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useCommandPalette, type CommandResult, type CommandResultType } from '@/hooks/use-command-palette'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'layout-dashboard': LayoutDashboard,
  'credit-card': CreditCard,
  'calendar': Calendar,
  'settings': Settings,
  'plus': Plus,
  'sun-moon': SunMoon,
}

const TYPE_LABELS: Record<CommandResultType, string> = {
  subscription: 'Subscriptions',
  page: 'Pages',
  action: 'Actions',
}

export function CommandPalette() {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { commandPaletteOpen, closeCommandPalette, openSubscriptionDialog } = useUiStore()
  const { settings, setTheme } = useSettingsStore()
  const navigate = useNavigate()
  const groups = useCommandPalette(query)

  // Flatten results for keyboard navigation
  const flatResults = useMemo(
    () => groups.flatMap((g) => g.results),
    [groups]
  )

  // Reset state when opening
  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
    }
  }, [commandPaletteOpen])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    if (selected) {
      selected.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const executeResult = useCallback(
    (result: CommandResult) => {
      closeCommandPalette()

      if (result.type === 'subscription' && result.subscriptionId) {
        openSubscriptionDialog(result.subscriptionId)
      } else if (result.type === 'page' && result.route) {
        navigate(result.route)
      } else if (result.type === 'action') {
        if (result.action === 'add-subscription') {
          openSubscriptionDialog()
        } else if (result.action === 'toggle-theme') {
          const currentTheme = settings?.theme ?? 'dark'
          const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
          setTheme(nextTheme)
        }
      }
    },
    [closeCommandPalette, openSubscriptionDialog, navigate, settings?.theme, setTheme]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % Math.max(flatResults.length, 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + flatResults.length) % Math.max(flatResults.length, 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const result = flatResults[selectedIndex]
        if (result) {
          executeResult(result)
        }
      }
    },
    [flatResults, selectedIndex, executeResult]
  )

  // Track flat index for rendering
  let flatIndex = -1

  return (
    <Dialog open={commandPaletteOpen} onOpenChange={(open) => { if (!open) closeCommandPalette() }}>
      <DialogPortal>
        <DialogOverlay className="bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content
          className="fixed top-[20%] left-[50%] z-50 w-full max-w-lg translate-x-[-50%] rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl backdrop-blur-2xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          {/* Visually hidden title for accessibility */}
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search subscriptions, navigate pages, or run actions
          </DialogPrimitive.Description>

          {/* Search input */}
          <div className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <Search size={18} className="text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search subscriptions, pages, actions..."
              className="font-[family-name:var(--font-sans)] text-foreground placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              autoComplete="off"
              spellCheck={false}
            />
            <kbd className="font-[family-name:var(--font-mono)] text-muted-foreground hidden shrink-0 rounded border border-[var(--color-border)] bg-[var(--color-input)] px-1.5 py-0.5 text-[10px] uppercase tracking-widest sm:inline-block">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-72 overflow-y-auto p-2">
            {flatResults.length === 0 && query.trim() !== '' && (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}

            {groups.map((group) => (
              <div key={group.type} className="mb-1">
                <div className="font-[family-name:var(--font-mono)] text-muted-foreground px-2 py-1.5 text-[10px] uppercase tracking-widest">
                  {TYPE_LABELS[group.type]}
                </div>
                {group.results.map((result) => {
                  flatIndex++
                  const currentFlatIndex = flatIndex
                  const isSelected = currentFlatIndex === selectedIndex
                  const IconComponent = ICON_MAP[result.icon] || CreditCard

                  return (
                    <button
                      key={result.id}
                      data-selected={isSelected}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors',
                        isSelected
                          ? 'bg-primary/15 text-foreground'
                          : 'text-foreground/80 hover:bg-[var(--color-input)]'
                      )}
                      onClick={() => executeResult(result)}
                      onMouseEnter={() => setSelectedIndex(currentFlatIndex)}
                    >
                      <div className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                        result.type === 'subscription' ? 'bg-primary/10 text-primary' : 'bg-[var(--color-input)] text-muted-foreground'
                      )}>
                        <IconComponent size={16} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-[family-name:var(--font-sans)] truncate text-sm font-medium">
                          {result.title}
                        </div>
                        {result.subtitle && (
                          <div className="font-[family-name:var(--font-mono)] text-muted-foreground truncate text-[11px]">
                            {result.subtitle}
                          </div>
                        )}
                      </div>
                      {isSelected && (
                        <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 border-t border-[var(--color-border)] px-4 py-2">
            <div className="font-[family-name:var(--font-mono)] text-muted-foreground flex items-center gap-1 text-[10px] uppercase tracking-widest">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-input)] px-1 py-0.5">
                ↑↓
              </kbd>
              Navigate
            </div>
            <div className="font-[family-name:var(--font-mono)] text-muted-foreground flex items-center gap-1 text-[10px] uppercase tracking-widest">
              <kbd className="rounded border border-[var(--color-border)] bg-[var(--color-input)] px-1 py-0.5">
                ↵
              </kbd>
              Select
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
