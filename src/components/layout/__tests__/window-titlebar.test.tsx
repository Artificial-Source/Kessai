import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WindowTitlebar } from '../window-titlebar'

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    minimize: vi.fn(() => Promise.resolve()),
    toggleMaximize: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
    startDragging: vi.fn(() => Promise.resolve()),
  }),
}))

describe('WindowTitlebar', () => {
  afterEach(() => {
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
  })

  it('renders nothing in the browser, which draws its own window', () => {
    const { container } = render(<WindowTitlebar />)

    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByRole('button', { name: 'Close window' })).not.toBeInTheDocument()
  })

  it('renders named window controls inside the Tauri runtime', () => {
    ;(window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {}

    render(<WindowTitlebar />)

    expect(screen.getByRole('button', { name: 'Minimize window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Maximize or restore window' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument()
  })
})
