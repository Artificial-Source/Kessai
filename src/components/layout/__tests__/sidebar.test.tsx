import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Sidebar } from '../sidebar'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

// Mock matchMedia for useMediaQuery
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('1024px') ? true : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

function renderSidebar() {
  return render(
    <MemoryRouter>
      <Sidebar />
    </MemoryRouter>
  )
}

describe('Sidebar', () => {
  it('renders navigation links', () => {
    renderSidebar()

    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav).toBeInTheDocument()
  })

  it('shows Dashboard nav item', () => {
    renderSidebar()

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
  })

  it('shows Subscriptions nav item', () => {
    renderSidebar()

    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
  })

  it('shows Calendar nav item', () => {
    renderSidebar()

    expect(screen.getByText('Calendar')).toBeInTheDocument()
  })

  it('shows Settings nav item', () => {
    renderSidebar()

    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('shows all 4 nav items', () => {
    renderSidebar()

    const navLinks = screen.getAllByRole('link')
    expect(navLinks).toHaveLength(4)
  })

  it('renders Subby branding', () => {
    renderSidebar()

    expect(screen.getByText('Subby')).toBeInTheDocument()
  })

  it('renders collapse toggle button on desktop', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: /collapse sidebar/i })).toBeInTheDocument()
  })
})
