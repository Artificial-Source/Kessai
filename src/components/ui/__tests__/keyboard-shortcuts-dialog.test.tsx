import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { KeyboardShortcutsDialog } from '../keyboard-shortcuts-dialog'
import { useUiStore } from '@/stores/ui-store'

function rowFor(description: string) {
  const term = screen.getByText(description, { selector: 'dt' })
  return term.parentElement as HTMLElement
}

describe('KeyboardShortcutsDialog', () => {
  beforeEach(() => {
    useUiStore.setState({ shortcutsDialogOpen: true })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    useUiStore.setState({ shortcutsDialogOpen: false })
  })

  it('lists every implemented shortcut, grouped by where it works', () => {
    render(<KeyboardShortcutsDialog />)

    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' })
    for (const group of ['General', 'Go to', 'Subscriptions', 'Calendar', 'Command palette']) {
      expect(within(dialog).getByRole('heading', { name: group })).toBeInTheDocument()
    }

    for (const description of [
      'Open command palette',
      'Add subscription',
      'Show keyboard shortcuts',
      'Close dialog or palette',
      'Dashboard',
      'Subscriptions',
      'Calendar',
      'Settings',
      'Focus search',
      'Previous month',
      'Next month',
      'Jump to today',
      'Close day panel',
      'Move selection',
      'Open selected result',
    ]) {
      expect(rowFor(description)).toBeInTheDocument()
    }

    expect(within(rowFor('Jump to today')).getByText('T')).toBeInTheDocument()
    expect(within(rowFor('Previous month')).getByText('PgUp')).toBeInTheDocument()
    expect(within(rowFor('Focus search')).getByText('/')).toBeInTheDocument()
  })

  it('shows Ctrl as the modifier on non-Apple platforms', () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'Linux x86_64' })
    render(<KeyboardShortcutsDialog />)

    expect(within(rowFor('Open command palette')).getByText('Ctrl')).toBeInTheDocument()
  })

  it('shows ⌘ as the modifier on macOS', () => {
    vi.stubGlobal('navigator', { ...navigator, platform: 'MacIntel' })
    render(<KeyboardShortcutsDialog />)

    expect(within(rowFor('Open command palette')).getByText('⌘')).toBeInTheDocument()
    expect(within(rowFor('Next month')).getByText('⌘')).toBeInTheDocument()
  })

  it('closes through the store', () => {
    render(<KeyboardShortcutsDialog />)

    screen.getByRole('button', { name: 'Close' }).click()

    expect(useUiStore.getState().shortcutsDialogOpen).toBe(false)
  })
})
