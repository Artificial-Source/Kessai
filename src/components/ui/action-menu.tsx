import * as React from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

export interface ActionMenuItem {
  label: string
  icon?: IconComponent
  onSelect: () => void
  /** `danger` for destructive items (cancel, delete). */
  tone?: 'default' | 'danger'
}

interface ActionMenuProps {
  /** Names the trigger and the menu, e.g. "More actions for Netflix". */
  label: string
  items: ActionMenuItem[]
  className?: string
}

const GAP = 4
const EDGE = 8

/**
 * Overflow menu behind a visible "More" icon button (menu-button pattern): arrow keys,
 * Home/End, Escape and Tab close and return focus to the trigger. The menu is portalled
 * and fixed-positioned so it escapes scrolling and overflow-hidden containers.
 */
export function ActionMenu({ label, items, className }: ActionMenuProps) {
  const [open, setOpen] = React.useState(false)
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)
  const menuId = React.useId()

  const close = React.useCallback((restoreFocus: boolean) => {
    setOpen(false)
    setPosition(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  // Place under the trigger, right-aligned; flip above when the viewport runs out.
  React.useLayoutEffect(() => {
    if (!open) return
    const trigger = triggerRef.current?.getBoundingClientRect()
    const menu = menuRef.current
    if (!trigger || !menu) return
    const { offsetWidth: width, offsetHeight: height } = menu
    const below = trigger.bottom + GAP
    const top =
      below + height > window.innerHeight - EDGE && trigger.top - GAP - height > EDGE
        ? trigger.top - GAP - height
        : below
    const left = Math.min(Math.max(trigger.right - width, EDGE), window.innerWidth - width - EDGE)
    setPosition({ top, left })
  }, [open])

  // Focus only once the menu is positioned and visible: an `invisible` element
  // silently ignores focus(), which left keyboard users stranded on the trigger.
  React.useLayoutEffect(() => {
    if (!open || !position) return
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
  }, [open, position])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    const onViewportChange = () => close(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onViewportChange)
    window.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onViewportChange)
      window.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, close])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []
    )
    const index = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    const focusAt = (next: number) =>
      menuItems[(next + menuItems.length) % menuItems.length]?.focus()

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focusAt(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focusAt(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focusAt(0)
        break
      case 'End':
        event.preventDefault()
        focusAt(menuItems.length - 1)
        break
      case 'Escape':
      case 'Tab':
        event.preventDefault()
        close(true)
        break
    }
  }

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={cn('text-muted-foreground hover:text-foreground', className)}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <MoreHorizontal aria-hidden="true" />
      </Button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              tabIndex={-1}
              aria-label={label}
              onKeyDown={handleMenuKeyDown}
              // Positioned in a layout effect before paint, so the unpositioned
              // first commit is never visible; no visibility toggle (which would
              // block focus() while any `visibility` transition runs).
              className="bg-popover text-popover-foreground border-border-hover fixed z-50 flex min-w-44 flex-col rounded-md border p-1 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]"
              style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
            >
              {items.map(({ label: itemLabel, icon: Icon, onSelect, tone = 'default' }) => (
                <button
                  key={itemLabel}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => {
                    close(true)
                    onSelect()
                  }}
                  className={cn(
                    'hover:bg-accent-muted focus:bg-accent-muted flex min-h-9 w-full items-center gap-2.5 rounded-sm px-2.5 text-left text-sm outline-none pointer-coarse:min-h-11',
                    tone === 'danger' ? 'text-destructive' : 'text-foreground'
                  )}
                >
                  {Icon ? <Icon className="size-4 shrink-0" aria-hidden={true} /> : null}
                  {itemLabel}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  )
}
