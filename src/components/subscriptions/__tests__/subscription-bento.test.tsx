import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SubscriptionBento } from '../subscription-bento'
import type { Subscription } from '@/types/subscription'

const makeSub = (overrides: Partial<Subscription> = {}): Subscription => ({
  id: 'sub-1',
  name: 'Netflix',
  amount: 10,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 1,
  category_id: null,
  card_id: null,
  color: '#8b5cf6',
  logo_url: null,
  notes: null,
  is_active: true,
  next_payment_date: '2026-11-01',
  status: 'active',
  trial_end_date: null,
  status_changed_at: null,
  shared_count: 1,
  is_pinned: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

/** The bento lays tiles out in its measured container; jsdom has no layout, so size it here. */
let containerSize = { width: 1000, height: 600 }

class ImmediateResizeObserver {
  private readonly callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
  }

  observe(target: Element) {
    this.callback([{ target } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)
  }

  unobserve() {}

  disconnect() {}
}

beforeEach(() => {
  containerSize = { width: 1000, height: 600 }
  vi.stubGlobal('ResizeObserver', ImmediateResizeObserver)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        ...containerSize,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: containerSize.width,
        bottom: containerSize.height,
        toJSON: () => ({}),
      }) as DOMRect
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function renderBento(subscriptions: Subscription[]) {
  return render(
    <SubscriptionBento
      subscriptions={subscriptions}
      categories={[]}
      currency="USD"
      costNormalization="as-is"
      onEdit={vi.fn()}
    />
  )
}

const tile = (name: string) =>
  screen.getByRole('button', { name: (accessible) => accessible.startsWith(`Edit ${name},`) })

describe('SubscriptionBento', () => {
  it('shares tiles by the user’s part of the billable display-currency total', () => {
    renderBento([
      // $12/wk split two ways: $26/mo is the user's share ($52/mo in full).
      makeSub({
        id: 'meal-kit',
        name: 'Meal Kit',
        amount: 12,
        billing_cycle: 'weekly',
        shared_count: 2,
      }),
      makeSub({ id: 'hosting', name: 'Hosting', amount: 78 }),
      makeSub({ id: 'gym', name: 'Gym', amount: 50, status: 'paused', is_active: false }),
      makeSub({ id: 'lessons', name: 'Lessons', amount: 3200, currency: 'JPY' }),
    ])

    const mealKit = tile('Meal Kit')
    expect(mealKit).toHaveAccessibleName(
      'Edit Meal Kit, $12.00/wk, your share $6.00, 25% of the USD total'
    )
    expect(within(mealKit).getByText('$12.00')).toBeVisible()
    expect(within(mealKit).getByText('Your share $6.00')).toBeVisible()
    expect(within(mealKit).getByText('25%')).toBeVisible()
    expect(within(tile('Hosting')).getByText('75%')).toBeVisible()
    const shares = screen.getAllByRole('button').flatMap((button) => {
      const share = button.getAttribute('aria-label')?.match(/([\d.]+)% of the USD total/)
      return share ? [Number(share[1])] : []
    })
    expect(shares.reduce((sum, share) => sum + share, 0)).toBe(100)

    const gym = tile('Gym')
    expect(gym).toHaveAccessibleName('Edit Gym, $50.00/mo, paused, not in the USD total')
    expect(within(gym).getByText('Paused')).toBeVisible()
    expect(within(gym).queryByText(/%/)).not.toBeInTheDocument()

    const lessons = tile('Lessons')
    expect(lessons).toHaveAccessibleName(expect.stringMatching(/in JPY, not in the USD total$/))
    expect(within(lessons).queryByText(/%/)).not.toBeInTheDocument()
  })

  it('names medium tiles, pinned ones included, instead of showing only a logo', () => {
    // Four equal tiles in 260×200 come out about 127×97: medium, not large.
    containerSize = { width: 260, height: 200 }
    const names = ['Netflix Premium', 'GitHub Pro', 'Tailscale Personal Plus', 'iCloud+ 2TB']
    renderBento(
      names.map((name, index) =>
        makeSub({ id: `sub-${index}`, name, is_pinned: name !== 'iCloud+ 2TB' })
      )
    )

    for (const name of names) {
      const button = tile(name)
      expect(within(button).getByText(name)).toBeVisible()
      expect(button).toHaveAttribute('title', name)
    }
  })
})
