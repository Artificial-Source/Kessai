import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubscriptionLogo } from '../subscription-logo'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/logo-storage', () => ({
  getLogoDataUrl: vi.fn().mockResolvedValue(null),
}))

describe('SubscriptionLogo', () => {
  it('renders fallback initial when no logo', () => {
    render(<SubscriptionLogo logoUrl={null} name="Netflix" />)

    expect(screen.getByText('N')).toBeInTheDocument()
  })

  it('renders correct initial letter from name', () => {
    render(<SubscriptionLogo logoUrl={null} name="Spotify" />)

    expect(screen.getByText('S')).toBeInTheDocument()
  })

  it('renders uppercase initial', () => {
    render(<SubscriptionLogo logoUrl={null} name="apple tv+" />)

    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('applies sm size class', () => {
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" size="sm" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('h-5', 'w-5')
  })

  it('applies md size class (default)', () => {
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('h-10', 'w-10')
  })

  it('applies lg size class', () => {
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" size="lg" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('h-12', 'w-12')
  })

  it('applies xl size class', () => {
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" size="xl" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('h-16', 'w-16')
  })

  it('uses provided color as background', () => {
    const { container } = render(
      <SubscriptionLogo logoUrl={null} name="Netflix" color="#ff0000" />
    )

    const el = container.firstChild as HTMLElement
    expect(el).toHaveStyle({ backgroundColor: '#ff0000' })
  })

  it('applies additional className', () => {
    const { container } = render(
      <SubscriptionLogo logoUrl={null} name="Netflix" className="rounded-lg" />
    )

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('rounded-lg')
  })
})
