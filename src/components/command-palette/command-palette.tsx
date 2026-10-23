import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  SearchX,
  LayoutDashboard,
  CreditCard,
  Calendar,
  Settings,
  Plus,
  SunMoon,
  Keyboard,
  CornerDownLeft,
  X,
} from 'lucide-react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogPortal, DialogOverlay } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { useUiStore } from '@/stores/ui-store'
import { useTheme } from '@/components/theme-provider'
import {
  useCommandPalette,
  type CommandResult,
  type CommandResultType,
} from '@/hooks/use-command-palette'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  'layout-dashboard': LayoutDashboard,
  'credit-card': CreditCard,
  calendar: Calendar,
  settings: Settings,
  plus: Plus,
  'sun-moon': SunMoon,
  keyboard: Keyboard,
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

  const { commandPaletteOpen, closeCommandPalette, openSubscriptionDialog, openShortcutsDialog } =
    useUiStore(
      useShallow((state) => ({
        commandPaletteOpen: state.commandPaletteOpen,
        closeCommandPalette: state.closeCommandPalette,
        openSubscriptionDialog: state.openSubscriptionDialog,
        openShortcutsDialog: state.openShortcutsDialog,
      }))
    )
  const { resolvedTheme, setTheme } = useTheme()
  const navigate = useNavigate()
  const groups = useCommandPalette(query)

  // Flatten results for keyboard navigation
  const flatResults = useMemo(() => groups.flatMap((g) => g.results), [groups])

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
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
        } else if (result.action === 'show-shortcuts') {
          openShortcutsDialog()
        }
      }
    },
    [
      closeCommandPalette,
      openSubscriptionDialog,
      openShortcutsDialog,
      navigate,
      resolvedTheme,
      setTheme,
    ]
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

  const trimmedQuery = query.trim()
  const hasNoResults = flatResults.length === 0 && trimmedQuery !== ''

  // Track flat index for rendering
  let flatIndex = -1

  return (
    <Dialog
      open={commandPaletteOpen}
      onOpenChange={(open) => {
        if (!open) closeCommandPalette()
      }}
    >
      <DialogPortal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="border-ghost bg-surface-elevated/90 shadow-ambient data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] fixed top-4 left-[50%] z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl translate-x-[-50%] flex-col overflow-hidden rounded-xl backdrop-blur-2xl duration-150 sm:top-[16vh] sm:max-h-[min(32rem,calc(100dvh-20vh))]"
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Search subscriptions, jump to a page, or run an action. Use the arrow keys to move and
            Enter to open.
          </DialogPrimitive.Description>

          {/* Search input */}
          <div className="border-border flex shrink-0 items-center gap-3 border-b px-4">
            <Search size={18} className="text-muted-foreground shrink-0" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search subscriptions, pages, actions…"
              className="text-foreground placeholder:text-muted-foreground h-14 w-full bg-transparent text-base outline-none sm:text-sm"
              autoComplete="off"
              spellCheck={false}
              aria-label="Search subscriptions, pages, actions"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={flatResults.length > 0}
              aria-controls="command-palette-results"
              aria-activedescendant={
                flatResults[selectedIndex]
                  ? `command-result-${flatResults[selectedIndex].id}`
                  : undefined
              }
            />
            <Kbd className="hidden sm:inline-flex" aria-hidden="true">
              Esc
            </Kbd>
            <DialogPrimitive.Close
              className="text-muted-foreground hover:bg-accent-muted hover:text-foreground -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md sm:hidden pointer-coarse:size-11"
              aria-label="Close"
            >
              <X size={18} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>

          {/* Results */}
          <div
            ref={listRef}
            id="command-palette-results"
            role="listbox"
            aria-label="Results"
            className="min-h-0 flex-1 overflow-y-auto p-2"
          >
            {hasNoResults ? (
              <div
                className="flex flex-col items-center gap-2 px-6 py-10 text-center"
                role="status"
              >
                <SearchX size={20} className="text-muted-foreground" aria-hidden="true" />
                <p className="text-foreground text-sm font-medium">
                  No matches for &ldquo;{trimmedQuery}&rdquo;
                </p>
                <p className="text-muted-foreground text-xs">
                  Try a subscription name, a category, or a page.
                </p>
              </div>
            ) : null}

            {groups.map((group) => (
              <div
                key={group.type}
                role="group"
                aria-labelledby={`command-group-${group.type}`}
                className="mb-1 last:mb-0"
              >
                <div
                  id={`command-group-${group.type}`}
                  className="type-label text-muted-foreground px-2 pt-2 pb-1.5"
                >
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
                      type="button"
                      tabIndex={-1}
                      id={`command-result-${result.id}`}
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      className={cn(
                        'flex min-h-12 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-100',
                        isSelected ? 'bg-accent-muted text-foreground' : 'text-foreground/85'
                      )}
                      onClick={() => executeResult(result)}
                      onMouseMove={() => {
                        if (!isSelected) setSelectedIndex(currentFlatIndex)
                      }}
                    >
                      <span
                        className={cn(
                          'flex size-8 shrink-0 items-center justify-center rounded-sm border',
                          isSelected
                            ? 'border-border-hover bg-primary text-primary-foreground'
                            : 'border-border bg-input text-muted-foreground'
                        )}
                      >
                        <IconComponent size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{result.title}</span>
                        {result.subtitle ? (
                          <span className="text-muted-foreground block truncate font-[family-name:var(--font-mono)] text-[11px]">
                            {result.subtitle}
                          </span>
                        ) : null}
                      </span>
                      {isSelected ? (
                        <CornerDownLeft
                          size={14}
                          className="text-muted-foreground hidden shrink-0 sm:block"
                          aria-hidden="true"
                        />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div
            aria-hidden="true"
            className="type-label border-border text-muted-foreground hidden shrink-0 items-center gap-4 border-t px-4 py-2.5 sm:flex"
          >
            <span className="flex items-center gap-1.5">
              <Kbd className="h-5 min-w-5">↑</Kbd>
              <Kbd className="h-5 min-w-5">↓</Kbd>
              Move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="h-5">Enter</Kbd>
              Open
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd className="h-5">Esc</Kbd>
              Close
            </span>
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  )
}
