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

    expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument()
  })

  it('shows Subscriptions nav item', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /subscriptions/i })).toBeInTheDocument()
  })

  it('shows Calendar nav item', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /calendar/i })).toBeInTheDocument()
  })

  it('shows Settings nav item', () => {
    renderSidebar()

    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('shows all 4 nav items', () => {
    renderSidebar()

    const navLinks = screen.getAllByRole('link')
    expect(navLinks).toHaveLength(4)
  })

  it('renders Kessai branding', () => {
    renderSidebar()

    expect(screen.getByAltText('Kessai')).toBeInTheDocument()
  })

  it('renders search button on desktop', () => {
    renderSidebar()

    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })
})
