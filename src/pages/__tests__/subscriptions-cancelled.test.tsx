import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { Subscriptions } from '../subscriptions'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { usePaymentStore } from '@/stores/payment-store'
import { useTagStore } from '@/stores/tag-store'
import { useUiStore } from '@/stores/ui-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Category } from '@/types/category'
import type { Subscription, SubscriptionStatus } from '@/types/subscription'
import type { Tag } from '@/types/tag'
import type * as ApiModule from '@/lib/api'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))
vi.mock('@/components/ui/confirm-dialog', () => ({ ConfirmDialog: () => null }))
vi.mock('@/components/subscriptions/cancel-dialog', () => ({ CancelDialog: () => null }))

const subscription = (overrides: Partial<Subscription>): Subscription => ({
  id: 'subscription',
  name: 'Subscription',
  amount: 12,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: null,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: dayjs().add(10, 'day').format('YYYY-MM-DD'),
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  created_at: '2024-01-01T00:00:00.000Z',
  updated_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

const cancelled = (overrides: Partial<Subscription>) =>
  subscription({
    status: 'cancelled',
    is_active: false,
    cancelled_at: '2024-06-01T00:00:00.000Z',
    ...overrides,
  })

const categories: Category[] = [
  {
    id: 'cat-streaming',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'tv',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-software',
    name: 'Software',
    color: '#3b82f6',
    icon: 'code',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
]

const tags: Tag[] = [
  { id: 'tag-family', name: 'Family plan', color: '#10b981', created_at: '2024-01-01T00:00:00Z' },
]

const tagLinks: Record<string, string[]> = {
  'stream-club': ['tag-family'],
  'old-stream': ['tag-family'],
}

let subscriptions: Subscription[]

function renderPage() {
  render(<Subscriptions />, { wrapper: MemoryRouter })
}

const cancelledSection = () => screen.getByRole('region', { name: 'Cancelled subscriptions' })

/** Expands the cancelled section and returns the names it lists. */
async function cancelledNames() {
  const toggle = within(cancelledSection()).getByRole('button', {
    name: /Cancelled subscriptions/,
  })
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  const buttons = within(cancelledSection()).getAllByRole('button', { name: /^Reactivate / })
  return buttons.map((button) => button.getAttribute('aria-label')!.replace('Reactivate ', ''))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  subscriptions = [
    subscription({ id: 'stream-club', name: 'Stream Club', category_id: 'cat-streaming' }),
    subscription({ id: 'code-forge', name: 'Code Forge', category_id: 'cat-software' }),
    cancelled({ id: 'old-stream', name: 'Old Stream', category_id: 'cat-streaming' }),
    cancelled({ id: 'old-forge', name: 'Old Forge', category_id: 'cat-software' }),
  ]
  const settings = { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'USD' }
  useSubscriptionStore.setState({ subscriptions: [], isLoading: false, error: null })
  useCategoryStore.setState({ categories: [], isLoading: false, error: null })
  useSettingsStore.setState({ settings, isLoading: false, error: null })
  usePaymentStore.setState({ payments: [], calendarMonths: {}, isLoading: false, error: null })
  useTagStore.setState({ tags: [], isLoading: false, error: null })
  useUiStore.setState({ costNormalization: 'as-is' })
  invoke.mockImplementation(
    async (command: string, args?: { id?: string; status?: SubscriptionStatus }) => {
      switch (command) {
        case 'list_subscriptions':
          return subscriptions
        case 'get_settings':
          return settings
        case 'list_categories':
          return categories
        case 'list_tags':
          return tags
        case 'list_subscription_tags_batch':
          return Object.entries(tagLinks).flatMap(([subscription_id, ids]) =>
            ids.map((tag_id) => ({ subscription_id, tag_id }))
          )
        case 'transition_subscription_status': {
          subscriptions = subscriptions.map((sub) =>
            sub.id === args?.id
              ? { ...sub, status: args.status!, is_active: true, cancelled_at: null }
              : sub
          )
          return subscriptions.find((sub) => sub.id === args?.id)
        }
        default:
          throw new Error(`Unexpected command: ${command}`)
      }
    }
  )
})

afterEach(cleanup)

describe('Cancelled subscriptions section', () => {
  it('applies the search, category, and tag filters to cancelled rows', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'More actions for Stream Club' })
    expect(await cancelledNames()).toEqual(['Old Stream', 'Old Forge'])

    const search = screen.getByRole('searchbox', { name: 'Search subscriptions' })
    fireEvent.change(search, { target: { value: 'stream' } })
    expect(await cancelledNames()).toEqual(['Old Stream'])

    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.getByText('No subscriptions match “zzzz”')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Cancelled subscriptions' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear search and filters' }))

    const categoryFilter = screen.getByRole('group', { name: 'Filter by category' })
    fireEvent.click(within(categoryFilter).getByRole('button', { name: /Software/ }))
    expect(await cancelledNames()).toEqual(['Old Forge'])
    fireEvent.click(within(categoryFilter).getByRole('button', { name: 'All categories' }))

    const tagFilter = await screen.findByRole('group', { name: 'Filter by tag' })
    fireEvent.click(within(tagFilter).getByRole('button', { name: /Family plan/ }))
    expect(await cancelledNames()).toEqual(['Old Stream'])
  })

  it('lists every cancelled row while there is no toolbar to clear filters with', async () => {
    subscriptions = subscriptions.filter((sub) => sub.status === 'cancelled')
    renderPage()

    await screen.findByText('No active subscriptions')
    expect(screen.queryByRole('searchbox', { name: 'Search subscriptions' })).toBeNull()
    expect(await cancelledNames()).toEqual(['Old Stream', 'Old Forge'])
  })

  it('says only cancelled rows match a search and opens them', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'More actions for Stream Club' })
    const toggle = within(cancelledSection()).getByRole('button', {
      name: /Cancelled subscriptions/,
    })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    const search = screen.getByRole('searchbox', { name: 'Search subscriptions' })
    fireEvent.change(search, { target: { value: 'old forge' } })

    expect(screen.getByText('No active subscriptions match “old forge”')).toBeInTheDocument()
    expect(screen.getByText('1 cancelled subscription matches; it’s listed below.')).toBeVisible()
    expect(screen.queryByText(/^No subscriptions match/)).toBeNull()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(
      within(cancelledSection()).getByRole('button', { name: 'Reactivate Old Forge' })
    ).toBeVisible()

    // Collapsing stays the user's call while the same matches are showing.
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    fireEvent.change(search, { target: { value: 'old' } })
    expect(screen.getByText('No active subscriptions match “old”')).toBeInTheDocument()
    expect(screen.getByText('2 cancelled subscriptions match; they’re listed below.')).toBeVisible()
  })

  it('reactivates a cancelled subscription back into the active list', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'More actions for Stream Club' })
    await cancelledNames()

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate Old Stream' }))

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('transition_subscription_status', {
        id: 'old-stream',
        status: 'active',
      })
    )
    expect(
      await screen.findByRole('button', { name: 'More actions for Old Stream' })
    ).toBeInTheDocument()
    expect(await cancelledNames()).toEqual(['Old Forge'])
    expect(toast.success).toHaveBeenCalledWith(
      'Reactivated Old Stream',
      expect.objectContaining({ description: expect.stringMatching(/^Next payment /) })
    )
  })

  it('asks for a new date when the reactivated payment date has passed', async () => {
    subscriptions = subscriptions.map((sub) =>
      sub.id === 'old-forge' ? { ...sub, next_payment_date: '2024-05-01' } : sub
    )
    useUiStore.setState({ subscriptionDialogOpen: false, editingSubscriptionId: null })
    renderPage()
    await screen.findByRole('button', { name: 'More actions for Stream Club' })
    await cancelledNames()

    fireEvent.click(screen.getByRole('button', { name: 'Reactivate Old Forge' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const [title, options] = vi.mocked(toast.success).mock.calls[0] as [
      string,
      { description: string; action: { label: string; onClick: () => void } },
    ]
    expect(title).toBe('Reactivated Old Forge')
    expect(options.description).toMatch(/has passed\. Edit it/)
    expect(options.action.label).toBe('Edit')
    options.action.onClick()
    expect(useUiStore.getState()).toMatchObject({
      subscriptionDialogOpen: true,
      editingSubscriptionId: 'old-forge',
    })
  })
})
