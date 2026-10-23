import { useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useUiStore } from '@/stores/ui-store'

const ROUTE_MAP: Record<string, string> = {
  '1': '/',
  '2': '/subscriptions',
  '3': '/calendar',
  '4': '/settings',
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate()
  const location = useLocation()
  const {
    openSubscriptionDialog,
    closeSubscriptionDialog,
    subscriptionDialogOpen,
    shortcutsDialogOpen,
    openShortcutsDialog,
    closeShortcutsDialog,
    commandPaletteOpen,
    openCommandPalette,
    closeCommandPalette,
  } = useUiStore()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl+K — Open command palette (must be before modifier key early return)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (commandPaletteOpen) {
          closeCommandPalette()
        } else {
          openCommandPalette()
        }
        return
      }

      // Never intercept when modifier keys are held (except Shift for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // Escape always works, even in inputs
      if (e.key === 'Escape') {
        if (commandPaletteOpen) {
          closeCommandPalette()
          e.preventDefault()
          return
        }
        if (shortcutsDialogOpen) {
          closeShortcutsDialog()
          e.preventDefault()
          return
        }
        if (subscriptionDialogOpen) {
          closeSubscriptionDialog()
          e.preventDefault()
          return
        }
        return
      }

      // All other shortcuts should not fire in editable fields
      if (isEditableTarget(e.target)) return

      // ? — Show keyboard shortcuts help
      if (e.key === '?') {
        e.preventDefault()
        if (shortcutsDialogOpen) {
          closeShortcutsDialog()
        } else {
          openShortcutsDialog()
        }
        return
      }

      // Don't process shortcuts when a dialog is open
      if (subscriptionDialogOpen || shortcutsDialogOpen) return

      // N — Open new subscription dialog
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault()
        openSubscriptionDialog()
        return
      }

      // / — Focus search bar (on subscriptions page)
      if (e.key === '/') {
        if (location.pathname === '/subscriptions') {
          e.preventDefault()
          const searchInput = document.querySelector<HTMLInputElement>(
            'input[placeholder*="Search"]'
          )
          if (searchInput) {
            searchInput.focus()
          }
        }
        return
      }

      // 1-4 — Navigate to pages
      const route = ROUTE_MAP[e.key]
      if (route) {
        e.preventDefault()
        navigate(route)
        return
      }
    },
    [
      navigate,
      location.pathname,
      openSubscriptionDialog,
      closeSubscriptionDialog,
      subscriptionDialogOpen,
      shortcutsDialogOpen,
      openShortcutsDialog,
      closeShortcutsDialog,
      commandPaletteOpen,
      openCommandPalette,
      closeCommandPalette,
    ]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
