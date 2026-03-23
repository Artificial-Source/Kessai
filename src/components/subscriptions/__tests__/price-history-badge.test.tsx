import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PriceHistoryBadge } from '../price-history-badge'
import { usePriceHistoryStore } from '@/stores/price-history-store'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}))

describe('PriceHistoryBadge', () => {
  beforeEach(() => {
    usePriceHistoryStore.setState({
      recentChanges: [],
      isLoading: false,
      error: null,
      fetchRecent: vi.fn().mockResolvedValue(undefined),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
      getLatest: vi.fn().mockResolvedValue(null),
    })
  })

  it('renders nothing when no price change exists', async () => {
    const { container } = render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    // Wait for the useEffect to resolve
    await waitFor(() => {
      expect(container.querySelector('button')).toBeNull()
    })
  })

  it('renders badge when price increased', async () => {
    usePriceHistoryStore.setState({
      getLatest: vi.fn().mockResolvedValue({
        id: 'ph-1',
        subscription_id: 'sub-1',
        old_amount: 10,
        new_amount: 15,
        changed_at: '2026-01-15T00:00:00.000Z',
      }),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
    })

    render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    await waitFor(() => {
      const badge = screen.getByRole('button')
      expect(badge).toBeInTheDocument()
      // Should show increase amount and percentage
      expect(badge.textContent).toContain('+')
      expect(badge.textContent).toContain('50%')
    })
  })

  it('renders badge when price decreased', async () => {
    usePriceHistoryStore.setState({
      getLatest: vi.fn().mockResolvedValue({
        id: 'ph-2',
        subscription_id: 'sub-1',
        old_amount: 20,
        new_amount: 15,
        changed_at: '2026-01-15T00:00:00.000Z',
      }),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
    })

    render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    await waitFor(() => {
      const badge = screen.getByRole('button')
      expect(badge).toBeInTheDocument()
      expect(badge.textContent).toContain('-')
      expect(badge.textContent).toContain('25%')
    })
  })

  it('applies increase styling (amber) for price increase', async () => {
    usePriceHistoryStore.setState({
      getLatest: vi.fn().mockResolvedValue({
        id: 'ph-1',
        subscription_id: 'sub-1',
        old_amount: 10,
        new_amount: 15,
        changed_at: '2026-01-15T00:00:00.000Z',
      }),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
    })

    render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    await waitFor(() => {
      const badge = screen.getByRole('button')
      expect(badge.className).toContain('border-amber-500')
    })
  })

  it('applies decrease styling (emerald) for price decrease', async () => {
    usePriceHistoryStore.setState({
      getLatest: vi.fn().mockResolvedValue({
        id: 'ph-2',
        subscription_id: 'sub-1',
        old_amount: 20,
        new_amount: 15,
        changed_at: '2026-01-15T00:00:00.000Z',
      }),
      fetchBySubscription: vi.fn().mockResolvedValue([]),
    })

    render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    await waitFor(() => {
      const badge = screen.getByRole('button')
      expect(badge.className).toContain('border-emerald-500')
    })
  })

  it('shows popover with price history on click', async () => {
    usePriceHistoryStore.setState({
      getLatest: vi.fn().mockResolvedValue({
        id: 'ph-1',
        subscription_id: 'sub-1',
        old_amount: 10,
        new_amount: 15,
        changed_at: '2026-01-15T00:00:00.000Z',
      }),
      fetchBySubscription: vi.fn().mockResolvedValue([
        {
          id: 'ph-1',
          subscription_id: 'sub-1',
          old_amount: 10,
          new_amount: 15,
          changed_at: '2026-01-15T00:00:00.000Z',
        },
      ]),
    })

    render(<PriceHistoryBadge subscriptionId="sub-1" currency="USD" />)

    await waitFor(() => {
      expect(screen.getByRole('button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(screen.getByText('Price History')).toBeInTheDocument()
    })
  })
})
