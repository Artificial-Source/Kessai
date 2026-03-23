import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSubscriptionStore } from '../subscription-store'

const mockSubscriptions = [
  {
    id: 'sub-1',
    name: 'Netflix',
    amount: 15.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: null,
    category_id: 'cat-streaming',
    color: '#e50914',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    is_pinned: false,
    next_payment_date: '2024-02-15',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'sub-2',
    name: 'Spotify',
    amount: 9.99,
    currency: 'USD',
    billing_cycle: 'monthly' as const,
    billing_day: null,
    category_id: 'cat-music',
    color: '#1db954',
    logo_url: null,
    notes: null,
    is_active: true,
    status: 'active' as const,
    shared_count: 1,
    is_pinned: false,
    next_payment_date: '2024-02-20',
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  },
]

const mockInvoke = vi.fn()

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({
      subscriptions: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue(mockSubscriptions)
  })

  describe('fetch', () => {
    it('fetches subscriptions and updates state', async () => {
      await useSubscriptionStore.getState().fetch()

      expect(mockInvoke).toHaveBeenCalledWith('list_subscriptions')
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions).toHaveLength(2)
      expect(state.subscriptions[0].name).toBe('Netflix')
      expect(state.subscriptions[1].name).toBe('Spotify')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('returns booleans for is_active', async () => {
      await useSubscriptionStore.getState().fetch()

      const state = useSubscriptionStore.getState()
      expect(typeof state.subscriptions[0].is_active).toBe('boolean')
      expect(state.subscriptions[0].is_active).toBe(true)
    })

    it('sets loading state during fetch', async () => {
      const fetchPromise = useSubscriptionStore.getState().fetch()
      expect(useSubscriptionStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(useSubscriptionStore.getState().isLoading).toBe(false)
    })

    it('handles fetch errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await useSubscriptionStore.getState().fetch()

      const state = useSubscriptionStore.getState()
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('add', () => {
    it('adds a new subscription optimistically', async () => {
      const created = {
        ...mockSubscriptions[0],
        id: 'sub-new',
        name: 'Disney+',
        amount: 7.99,
        next_payment_date: '2024-02-25',
      }
      mockInvoke.mockResolvedValue(created)

      const newSub = {
        name: 'Disney+',
        amount: 7.99,
        currency: 'USD',
        billing_cycle: 'monthly' as const,
        billing_day: null,
        category_id: 'cat-streaming',
        color: '#113ccf',
        logo_url: null,
        notes: null,
        is_active: true,
        status: 'active' as const,
        shared_count: 1,
        is_pinned: false,
        next_payment_date: '2024-02-25',
      }

      await useSubscriptionStore.getState().add(newSub)

      expect(mockInvoke).toHaveBeenCalledWith('create_subscription', { data: newSub })
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions.some((s) => s.name === 'Disney+')).toBe(true)
    })

    it('rolls back on add failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Insert failed'))

      const newSub = {
        name: 'Test',
        amount: 9.99,
        currency: 'USD',
        billing_cycle: 'monthly' as const,
        billing_day: null,
        category_id: null,
        color: null,
        logo_url: null,
        notes: null,
        is_active: true,
        status: 'active' as const,
        shared_count: 1,
        is_pinned: false,
        next_payment_date: '2024-02-25',
      }

      await expect(useSubscriptionStore.getState().add(newSub)).rejects.toThrow('Insert failed')
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions.some((s) => s.name === 'Test')).toBe(false)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [...mockSubscriptions],
        isLoading: false,
        error: null,
      })
    })

    it('updates an existing subscription optimistically', async () => {
      const updated = { ...mockSubscriptions[0], name: 'Netflix Premium' }
      mockInvoke.mockResolvedValue(updated)

      await useSubscriptionStore.getState().update('sub-1', { name: 'Netflix Premium' })

      expect(mockInvoke).toHaveBeenCalledWith('update_subscription', {
        id: 'sub-1',
        data: { name: 'Netflix Premium' },
      })
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions.find((s) => s.id === 'sub-1')?.name).toBe('Netflix Premium')
    })

    it('rolls back on update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(
        useSubscriptionStore.getState().update('sub-1', { name: 'Failed Update' })
      ).rejects.toThrow('Update failed')
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions.find((s) => s.id === 'sub-1')?.name).toBe('Netflix')
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [...mockSubscriptions],
        isLoading: false,
        error: null,
      })
    })

    it('removes a subscription optimistically', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useSubscriptionStore.getState().remove('sub-1')

      expect(mockInvoke).toHaveBeenCalledWith('delete_subscription', { id: 'sub-1' })
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions).toHaveLength(1)
      expect(state.subscriptions[0].id).toBe('sub-2')
    })

    it('rolls back on remove failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'))

      await expect(useSubscriptionStore.getState().remove('sub-1')).rejects.toThrow('Delete failed')
      const state = useSubscriptionStore.getState()
      expect(state.subscriptions).toHaveLength(2)
      expect(state.subscriptions.some((s) => s.id === 'sub-1')).toBe(true)
    })
  })

  describe('toggleActive', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [...mockSubscriptions],
        isLoading: false,
        error: null,
      })
    })

    it('toggles subscription active state', async () => {
      const toggled = { ...mockSubscriptions[0], is_active: false }
      mockInvoke.mockResolvedValue(toggled)

      await useSubscriptionStore.getState().toggleActive('sub-1')

      expect(mockInvoke).toHaveBeenCalledWith('toggle_subscription_active', { id: 'sub-1' })
    })

    it('optimistically toggles is_active before server response', async () => {
      const toggled = { ...mockSubscriptions[0], is_active: false }
      mockInvoke.mockResolvedValue(toggled)

      await useSubscriptionStore.getState().toggleActive('sub-1')

      const sub = useSubscriptionStore.getState().subscriptions.find((s) => s.id === 'sub-1')
      expect(sub?.is_active).toBe(false)
    })

    it('rolls back on toggleActive failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Toggle failed'))

      await expect(useSubscriptionStore.getState().toggleActive('sub-1')).rejects.toThrow(
        'Toggle failed'
      )

      const sub = useSubscriptionStore.getState().subscriptions.find((s) => s.id === 'sub-1')
      expect(sub?.is_active).toBe(true)
    })

    it('does nothing when subscription not found', async () => {
      await useSubscriptionStore.getState().toggleActive('non-existent')

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('update edge cases', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [...mockSubscriptions],
        isLoading: false,
        error: null,
      })
    })

    it('does nothing when subscription not found', async () => {
      await useSubscriptionStore.getState().update('non-existent', { name: 'Test' })

      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('transitionStatus', () => {
    beforeEach(() => {
      useSubscriptionStore.setState({
        subscriptions: [...mockSubscriptions],
        isLoading: false,
        error: null,
      })
    })

    it('transitions subscription status optimistically', async () => {
      const updated = { ...mockSubscriptions[0], status: 'paused' as const }
      mockInvoke.mockResolvedValue(updated)

      await useSubscriptionStore.getState().transitionStatus('sub-1', 'paused')

      expect(mockInvoke).toHaveBeenCalledWith('transition_subscription_status', {
        id: 'sub-1',
        status: 'paused',
      })
      const sub = useSubscriptionStore.getState().subscriptions.find((s) => s.id === 'sub-1')
      expect(sub?.status).toBe('paused')
    })

    it('rolls back on transitionStatus failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Transition failed'))

      await expect(
        useSubscriptionStore.getState().transitionStatus('sub-1', 'cancelled')
      ).rejects.toThrow('Transition failed')

      const sub = useSubscriptionStore.getState().subscriptions.find((s) => s.id === 'sub-1')
      expect(sub?.status).toBe('active')
    })
  })
})
