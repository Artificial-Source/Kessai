import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SubscriptionLogo } from '../subscription-logo'
import { getLogoDataUrl } from '@/lib/logo-storage'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/logo-storage', () => ({
  getLogoDataUrl: vi.fn().mockResolvedValue(null),
}))

const mockGetLogoDataUrl = vi.mocked(getLogoDataUrl)

describe('SubscriptionLogo', () => {
  beforeEach(() => {
    mockGetLogoDataUrl.mockReset()
    mockGetLogoDataUrl.mockResolvedValue(null)
  })

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
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" color="#ff0000" />)

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

  it('renders logo image when getLogoDataUrl resolves with a data URL', async () => {
    mockGetLogoDataUrl.mockResolvedValue('data:image/png;base64,abc123')

    render(<SubscriptionLogo logoUrl="logos/netflix.png" name="Netflix" />)

    const img = await waitFor(() => screen.getByRole('img'))
    expect(img).toHaveAttribute('src', 'data:image/png;base64,abc123')
    expect(img).toHaveAttribute('alt', 'Netflix')
  })

  it('shows loading state while logo is being fetched', () => {
    // Make getLogoDataUrl hang (never resolve)
    mockGetLogoDataUrl.mockReturnValue(new Promise(() => {}))

    const { container } = render(<SubscriptionLogo logoUrl="logos/spotify.png" name="Spotify" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('animate-pulse')
  })

  it('falls back to initial when getLogoDataUrl fails', async () => {
    mockGetLogoDataUrl.mockRejectedValue(new Error('load failed'))

    render(<SubscriptionLogo logoUrl="logos/bad.png" name="Hulu" />)

    await waitFor(() => {
      expect(screen.getByText('H')).toBeInTheDocument()
    })
  })

  it('renders logo image with correct size class', async () => {
    mockGetLogoDataUrl.mockResolvedValue('data:image/png;base64,xyz')

    render(<SubscriptionLogo logoUrl="logos/test.png" name="Test" size="lg" />)

    const img = await waitFor(() => screen.getByRole('img'))
    expect(img).toHaveClass('h-12', 'w-12')
  })

  it('uses default primary color when no color provided', () => {
    const { container } = render(<SubscriptionLogo logoUrl={null} name="Netflix" />)

    const el = container.firstChild as HTMLElement
    expect(el).toHaveStyle({ backgroundColor: '#bf5af2' })
  })
})
