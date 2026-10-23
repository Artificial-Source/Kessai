import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category } from '@/types/category'
import type { Subscription } from '@/types/subscription'
import type { Tag } from '@/types/tag'

const { mockInvoke, toastErrorMock, toastSuccessMock, logoFetchState } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  logoFetchState: {
    fetchedLogoPreview: null,
    isFetchingLogo: false,
    fetchedLogoFilename: null,
    fetchLogo: () => {},
    clearFetchedLogo: () => {},
  },
}))

// Store writes are replaced per test below; this only keeps incidental reads off any transport.
vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock('@/hooks/use-logo-fetch', () => ({
  useLogoFetch: () => logoFetchState,
}))

vi.mock('@/lib/logo-storage', () => ({
  getLogoDataUrl: vi.fn(async () => null),
  pickAndSaveLogo: vi.fn(async () => null),
}))

import { SubscriptionDialog } from '../subscription-dialog'
import { getLogoDataUrl } from '@/lib/logo-storage'
import { useCategoryStore } from '@/stores/category-store'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useTagStore } from '@/stores/tag-store'
import { useUiStore } from '@/stores/ui-store'

const NOW = '2026-10-01T09:30:00.000Z'

const familyTag: Tag = { id: 'tag-family', name: 'Family', color: '#22c55e', created_at: NOW }
const workTag: Tag = { id: 'tag-work', name: 'Work', color: '#0ea5e9', created_at: NOW }

const streamingCategory: Category = {
  id: 'cat-streaming',
  name: 'Streaming',
  color: '#8b5cf6',
  icon: 'play-circle',
  is_default: true,
  created_at: NOW,
}

function makeSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub-1',
    name: 'Kagi',
    amount: 10,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: 12,
    category_id: null,
    card_id: null,
    color: '#8b5cf6',
    logo_url: null,
    notes: null,
    is_active: true,
    next_payment_date: '2026-11-12',
    status: 'active',
    trial_end_date: null,
    status_changed_at: null,
    shared_count: 1,
    is_pinned: false,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  }
}

// ES2020 is the application's supported library target (no Promise.withResolvers).
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const addMock = vi.fn()
const updateMock = vi.fn()
const addTagMock = vi.fn()
const removeTagMock = vi.fn()
const fetchTagsMock = vi.fn()

function renderDialog(editingSubscriptionId?: string) {
  useUiStore.getState().openSubscriptionDialog(editingSubscriptionId)
  return render(<SubscriptionDialog />)
}

/** The dialog's corner X is also named "Close", so footer queries are scoped to the form. */
function getForm() {
  const form = document.querySelector('form')
  if (!form) throw new Error('Subscription form is not rendered')
  return form
}

function startNewSubscription(name: string, amount: string) {
  fireEvent.click(screen.getByRole('button', { name: /start from scratch/i }))
  fireEvent.change(screen.getByLabelText('Name *'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: amount } })
}

describe('SubscriptionDialog', () => {
  beforeEach(() => {
    mockInvoke.mockReset().mockResolvedValue([])
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
    addMock.mockReset()
    updateMock.mockReset().mockResolvedValue(undefined)
    addTagMock.mockReset().mockResolvedValue(undefined)
    removeTagMock.mockReset().mockResolvedValue(undefined)
    fetchTagsMock.mockReset().mockResolvedValue([])

    useSubscriptionStore.setState({ subscriptions: [], add: addMock, update: updateMock })
    useTagStore.setState({
      tags: [familyTag, workTag],
      fetch: async () => {},
      addToSubscription: addTagMock,
      removeFromSubscription: removeTagMock,
      fetchForSubscription: fetchTagsMock,
    })
    useCategoryStore.setState({ categories: [streamingCategory], isLoading: false })
    usePaymentCardStore.setState({ cards: [], fetch: async () => {} })
    useUiStore.setState({ subscriptionDialogOpen: false, editingSubscriptionId: null })
  })

  afterEach(() => {
    cleanup()
  })

  describe('validation', () => {
    it('ties each error to its field and focuses the first invalid one', async () => {
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: /start from scratch/i }))
      fireEvent.submit(getForm())

      const name = screen.getByLabelText('Name *')
      await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
      expect(name).toHaveAccessibleDescription('Name is required')
      const amount = screen.getByLabelText('Amount *')
      expect(amount).toHaveAttribute('aria-invalid', 'true')
      expect(amount).toHaveAccessibleDescription(
        'The full charge. Use 0 for a free plan. Enter an amount (0 if it’s free)'
      )
      await waitFor(() => expect(name).toHaveFocus())
      expect(addMock).not.toHaveBeenCalled()
    })

    it('saves a zero amount as a free plan', async () => {
      addMock.mockResolvedValue(makeSubscription({ id: 'sub-free', name: 'Proton Free' }))
      renderDialog()
      startNewSubscription('Proton Free', '0')
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))

      await waitFor(() => expect(addMock).toHaveBeenCalledOnce())
      expect(addMock).toHaveBeenCalledWith(expect.objectContaining({ amount: 0 }))
    })

    it('rejects a negative amount with a plain message', async () => {
      renderDialog()
      startNewSubscription('Refund', '-5')
      fireEvent.submit(getForm())

      expect(await screen.findByText('Amount can’t be negative')).toBeInTheDocument()
      expect(addMock).not.toHaveBeenCalled()
    })
  })

  it('does not save an empty tag selection after an existing tag lookup fails', async () => {
    useSubscriptionStore.setState({ subscriptions: [makeSubscription()] })
    fetchTagsMock
      .mockRejectedValueOnce(new Error('Tag lookup failed'))
      .mockResolvedValue([familyTag])
    renderDialog('sub-1')
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load subscription tags')
    expect(screen.getByRole('button', { name: 'Update Subscription' })).toBeDisabled()
    fireEvent.submit(getForm())
    expect(updateMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading tags' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Family' })).toHaveAttribute('aria-pressed', 'true')
    )
    fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))
    await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
    expect(removeTagMock).not.toHaveBeenCalled()
  })

  describe('trial status', () => {
    it('moves an existing trial to active when the trial switch is turned off', async () => {
      useSubscriptionStore.setState({
        subscriptions: [
          makeSubscription({ id: 'sub-trial', status: 'trial', trial_end_date: '2026-11-01' }),
        ],
      })
      renderDialog('sub-trial')
      await waitFor(() => expect(fetchTagsMock).toHaveBeenCalledWith('sub-trial'))

      const trialSwitch = screen.getByRole('switch', { name: 'Free trial' })
      expect(trialSwitch).toHaveAttribute('aria-checked', 'true')
      fireEvent.click(trialSwitch)
      fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))

      await waitFor(() => expect(useUiStore.getState().subscriptionDialogOpen).toBe(false))
      expect(updateMock).toHaveBeenCalledTimes(1)
      expect(updateMock).toHaveBeenCalledWith(
        'sub-trial',
        expect.objectContaining({ status: 'active', trial_end_date: null })
      )
    })

    it('leaves a non-trial lifecycle status untouched', async () => {
      useSubscriptionStore.setState({
        subscriptions: [makeSubscription({ id: 'sub-paused', status: 'paused', is_active: false })],
      })
      renderDialog('sub-paused')
      await waitFor(() => expect(fetchTagsMock).toHaveBeenCalledWith('sub-paused'))

      fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))

      await waitFor(() => expect(updateMock).toHaveBeenCalledTimes(1))
      const [id, payload] = updateMock.mock.calls[0]
      expect(id).toBe('sub-paused')
      expect(payload.status).toBeUndefined()
      expect(payload.trial_end_date).toBeNull()
    })

    it('asks when the trial ends instead of saving a trial without a countdown', async () => {
      renderDialog()
      startNewSubscription('Mubi', '12.99')
      fireEvent.click(screen.getByRole('switch', { name: 'Free trial' }))
      fireEvent.submit(getForm())

      const trialEnds = await screen.findByLabelText('Trial ends *')
      await waitFor(() => expect(trialEnds).toHaveAttribute('aria-invalid', 'true'))
      expect(trialEnds).toHaveAccessibleDescription('Enter when the trial ends')
      await waitFor(() => expect(trialEnds).toHaveFocus())
      expect(addMock).not.toHaveBeenCalled()
    })
  })

  describe('edit payload', () => {
    it('never sends billing_day and leaves an untouched next payment date out', async () => {
      useSubscriptionStore.setState({ subscriptions: [makeSubscription()] })
      renderDialog('sub-1')
      await waitFor(() => expect(fetchTagsMock).toHaveBeenCalledWith('sub-1'))

      fireEvent.change(screen.getByLabelText('Name *'), { target: { value: 'Kagi Ultimate' } })
      fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))

      await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
      const [id, payload] = updateMock.mock.calls[0]
      expect(id).toBe('sub-1')
      expect(payload.name).toBe('Kagi Ultimate')
      expect(payload).not.toHaveProperty('billing_day')
      expect(payload).not.toHaveProperty('next_payment_date')
    })

    it('sends a changed next payment date as the new anchor, still without billing_day', async () => {
      useSubscriptionStore.setState({ subscriptions: [makeSubscription()] })
      renderDialog('sub-1')
      await waitFor(() => expect(fetchTagsMock).toHaveBeenCalledWith('sub-1'))

      fireEvent.change(screen.getByLabelText('Next payment *'), {
        target: { value: '2026-11-20' },
      })
      fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))

      await waitFor(() => expect(updateMock).toHaveBeenCalledOnce())
      const [, payload] = updateMock.mock.calls[0]
      expect(payload.next_payment_date).toBe('2026-11-20')
      expect(payload).not.toHaveProperty('billing_day')
    })
  })

  describe('logo', () => {
    it('shows a bundled library logo as-is without reading the logo store', async () => {
      vi.mocked(getLogoDataUrl).mockClear()
      useSubscriptionStore.setState({
        subscriptions: [makeSubscription({ logo_url: '/logos/templates/x.png' })],
      })
      renderDialog('sub-1')
      await waitFor(() => expect(fetchTagsMock).toHaveBeenCalledWith('sub-1'))

      expect(screen.getByRole('img', { name: 'Logo preview' })).toHaveAttribute(
        'src',
        '/logos/templates/x.png'
      )
      expect(getLogoDataUrl).not.toHaveBeenCalled()
      expect(mockInvoke).not.toHaveBeenCalledWith('get_logo_base64', expect.anything())
    })

    it('creates a subscription from a template with its bundled logo', async () => {
      addMock.mockResolvedValue(makeSubscription({ id: 'sub-spotify', name: 'Spotify' }))
      renderDialog()
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search services' }), {
        target: { value: 'Spotify' },
      })
      fireEvent.click(screen.getByRole('button', { name: /^Spotify/ }))

      // The logo is in place before the folded Appearance section is ever opened.
      expect(screen.getByRole('img', { name: 'Logo preview', hidden: true })).toHaveAttribute(
        'src',
        '/logos/templates/spotify-com.png'
      )
      fireEvent.change(screen.getByLabelText('Amount *'), { target: { value: '11.99' } })
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))

      await waitFor(() => expect(addMock).toHaveBeenCalledOnce())
      expect(addMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Spotify', logo_url: '/logos/templates/spotify-com.png' })
      )
    })
  })

  describe('opened from a route that has not loaded subscriptions', () => {
    it('loads the list, then edits the right subscription', async () => {
      const fetchMock = vi.fn(async () => {
        useSubscriptionStore.setState({ subscriptions: [makeSubscription()] })
      })
      useSubscriptionStore.setState({ subscriptions: [], fetch: fetchMock, error: null })
      renderDialog('sub-1')

      expect(screen.getByRole('status')).toHaveTextContent('Loading subscription')
      expect(await screen.findByRole('heading', { name: 'Edit Kagi' })).toBeInTheDocument()
      expect(screen.getByLabelText('Name *')).toHaveValue('Kagi')
      expect(fetchMock).toHaveBeenCalledOnce()
    })

    it('says the subscription is gone rather than editing a blank draft', async () => {
      useSubscriptionStore.setState({
        subscriptions: [],
        fetch: vi.fn(async () => {}),
        error: null,
      })
      renderDialog('sub-deleted')

      expect(
        await screen.findByRole('heading', { name: 'This subscription isn’t here anymore' })
      ).toBeInTheDocument()
      expect(screen.queryByLabelText('Name *')).not.toBeInTheDocument()
      expect(updateMock).not.toHaveBeenCalled()
    })
  })

  describe('tag failure after a committed save', () => {
    it('keeps the created subscription and retries only its tags', async () => {
      addMock.mockResolvedValue(makeSubscription({ id: 'sub-new', name: 'Mubi' }))
      addTagMock.mockRejectedValueOnce(new Error('tag link failed'))
      renderDialog()
      startNewSubscription('Mubi', '12.99')
      fireEvent.click(screen.getByRole('button', { name: 'Family', pressed: false }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))

      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Subscription saved; tags failed')
      expect(alert).toHaveTextContent('Mubi is saved')
      expect(toastErrorMock).not.toHaveBeenCalled()
      expect(useUiStore.getState().subscriptionDialogOpen).toBe(true)

      const form = getForm()
      const retry = within(form).getByRole('button', { name: 'Retry tags' })
      await waitFor(() => expect(retry).toHaveFocus())
      expect(within(form).queryByRole('button', { name: 'Add Subscription' })).toBeNull()
      expect(screen.getByLabelText('Name *')).toBeDisabled()
      expect(screen.getByLabelText('Name *')).toHaveValue('Mubi')

      // Submitting the saved draft again must never create a second subscription.
      fireEvent.submit(form)
      await act(() => new Promise((resolve) => setTimeout(resolve, 0)))
      expect(addMock).toHaveBeenCalledTimes(1)

      fireEvent.click(retry)
      await waitFor(() => expect(useUiStore.getState().subscriptionDialogOpen).toBe(false))

      expect(addMock).toHaveBeenCalledTimes(1)
      expect(fetchTagsMock).toHaveBeenCalledWith('sub-new')
      expect(addTagMock.mock.calls).toEqual([
        ['sub-new', 'tag-family'],
        ['sub-new', 'tag-family'],
      ])
      expect(toastSuccessMock).toHaveBeenCalledWith('Tags saved', expect.any(Object))
    })

    it('keeps the updated subscription id and never updates it again', async () => {
      useSubscriptionStore.setState({ subscriptions: [makeSubscription()] })
      fetchTagsMock.mockResolvedValue([workTag])
      addTagMock.mockRejectedValueOnce(new Error('tag link failed'))
      renderDialog('sub-1')
      await screen.findByRole('button', { name: 'Work', pressed: true })

      fireEvent.click(screen.getByRole('button', { name: 'Family', pressed: false }))
      fireEvent.click(screen.getByRole('button', { name: 'Update Subscription' }))
      await screen.findByRole('alert')
      expect(updateMock).toHaveBeenCalledTimes(1)
      expect(toastErrorMock).not.toHaveBeenCalled()

      fireEvent.click(within(getForm()).getByRole('button', { name: 'Retry tags' }))
      await waitFor(() => expect(useUiStore.getState().subscriptionDialogOpen).toBe(false))

      expect(updateMock).toHaveBeenCalledTimes(1)
      expect(addMock).not.toHaveBeenCalled()
      // Form load, the save's tag delta, then the retry's fresh read: all against the same id.
      expect(fetchTagsMock.mock.calls).toEqual([['sub-1'], ['sub-1'], ['sub-1']])
      expect(addTagMock.mock.calls).toEqual([
        ['sub-1', 'tag-family'],
        ['sub-1', 'tag-family'],
      ])
      expect(removeTagMock).not.toHaveBeenCalled()
    })

    it('stays retryable after a failed retry and ignores repeats while one runs', async () => {
      addMock.mockResolvedValue(makeSubscription({ id: 'sub-new', name: 'Mubi' }))
      addTagMock
        .mockRejectedValueOnce(new Error('tag link failed'))
        .mockRejectedValueOnce(new Error('tag link failed again'))
      renderDialog()
      startNewSubscription('Mubi', '12.99')
      fireEvent.click(screen.getByRole('button', { name: 'Family', pressed: false }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))
      await screen.findByRole('alert')

      fireEvent.click(within(getForm()).getByRole('button', { name: 'Retry tags' }))
      await waitFor(() =>
        expect(toastErrorMock).toHaveBeenCalledWith('Tags still not saved', expect.any(Object))
      )
      const retry = within(getForm()).getByRole('button', { name: 'Retry tags' })
      expect(retry).toBeEnabled()
      expect(useUiStore.getState().subscriptionDialogOpen).toBe(true)

      const linksRead = deferred<Tag[]>()
      fetchTagsMock.mockReturnValueOnce(linksRead.promise)
      fireEvent.click(retry)
      fireEvent.click(retry)
      const busyRetry = within(getForm()).getByRole('button', { name: 'Retry tags' })
      expect(busyRetry).toBeDisabled()
      expect(busyRetry).toHaveAttribute('aria-busy', 'true')

      await act(async () => linksRead.resolve([]))
      await waitFor(() => expect(useUiStore.getState().subscriptionDialogOpen).toBe(false))

      expect(fetchTagsMock).toHaveBeenCalledTimes(2)
      expect(addTagMock).toHaveBeenCalledTimes(3)
      expect(addMock).toHaveBeenCalledTimes(1)
    })

    it('forgets the pending tag retry when the dialog closes', async () => {
      addMock.mockResolvedValueOnce(makeSubscription({ id: 'sub-new', name: 'Mubi' }))
      addTagMock.mockRejectedValueOnce(new Error('tag link failed'))
      renderDialog()
      startNewSubscription('Mubi', '12.99')
      fireEvent.click(screen.getByRole('button', { name: 'Family', pressed: false }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))
      await screen.findByRole('alert')

      fireEvent.click(within(getForm()).getByRole('button', { name: 'Close' }))
      expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)
      expect(screen.queryByRole('alert')).toBeNull()

      act(() => useUiStore.getState().openSubscriptionDialog())
      startNewSubscription('Criterion', '10.99')
      expect(screen.queryByRole('alert')).toBeNull()
      expect(within(getForm()).queryByRole('button', { name: 'Retry tags' })).toBeNull()

      // The next save is a new subscription with its own identity, not the abandoned retry.
      addMock.mockResolvedValueOnce(makeSubscription({ id: 'sub-second', name: 'Criterion' }))
      fireEvent.click(screen.getByRole('button', { name: 'Add Subscription' }))
      await waitFor(() => expect(useUiStore.getState().subscriptionDialogOpen).toBe(false))

      expect(addMock).toHaveBeenCalledTimes(2)
      expect(addMock).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'Criterion' }))
      expect(fetchTagsMock).not.toHaveBeenCalled()
      expect(addTagMock).toHaveBeenCalledTimes(1)
    })
  })
})
