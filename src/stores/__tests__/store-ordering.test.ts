import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryStore } from '../category-store'
import { usePaymentCardStore } from '../payment-card-store'
import { usePaymentStore } from '../payment-store'
import { useSubscriptionStore } from '../subscription-store'
import { useTagStore } from '../tag-store'
import { useSettingsStore } from '../settings-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type { Subscription } from '@/types/subscription'

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiInvoke: (...args: unknown[]) => mockInvoke(...args) }))

// ES2020 is the application's supported library target (no Promise.withResolvers).
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

const subscription: Subscription = {
  id: 'a',
  name: 'Original',
  amount: 10,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 1,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: '2026-10-01',
  status: 'active',
  shared_count: 1,
  is_pinned: false,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}
const category = {
  id: 'a',
  name: 'Original',
  color: '#123456',
  icon: 'box',
  is_default: false,
  created_at: '2026-01-01',
}
const card = { id: 'a', name: 'Original', color: '#123456', card_type: 'credit' as const }
const tag = { id: 'a', name: 'Original', color: '#123456', created_at: '2026-01-01' }
const payment = {
  id: 'a',
  subscription_id: 'sub',
  amount: 10,
  status: 'paid' as const,
  paid_at: '2026-10-01',
  due_date: '2026-10-01',
  notes: 'Original',
}

const domains = [
  {
    name: 'subscriptions',
    seed: () =>
      useSubscriptionStore.setState({
        subscriptions: [subscription, { ...subscription, id: 'b' }],
      }),
    rows: () => useSubscriptionStore.getState().subscriptions,
    update: (id: string, value: string) =>
      useSubscriptionStore.getState().update(id, { name: value }),
    remove: (id: string) => useSubscriptionStore.getState().remove(id),
    fetch: () => useSubscriptionStore.getState().fetch(),
    add: () => useSubscriptionStore.getState().add(subscription),
    error: () => useSubscriptionStore.getState().error,
    changed: (id: string, value: string) => ({ ...subscription, id, name: value }),
  },
  {
    name: 'categories',
    seed: () => useCategoryStore.setState({ categories: [category, { ...category, id: 'b' }] }),
    rows: () => useCategoryStore.getState().categories,
    update: (id: string, value: string) => useCategoryStore.getState().update(id, { name: value }),
    remove: (id: string) => useCategoryStore.getState().remove(id),
    fetch: () => useCategoryStore.getState().fetch(),
    add: () => useCategoryStore.getState().add(category),
    error: () => useCategoryStore.getState().error,
    changed: (id: string, value: string) => ({ ...category, id, name: value }),
  },
  {
    name: 'cards',
    seed: () => usePaymentCardStore.setState({ cards: [card, { ...card, id: 'b' }] }),
    rows: () => usePaymentCardStore.getState().cards,
    update: (id: string, value: string) =>
      usePaymentCardStore.getState().update(id, { name: value }),
    remove: (id: string) => usePaymentCardStore.getState().remove(id),
    fetch: () => usePaymentCardStore.getState().fetch(),
    add: () => usePaymentCardStore.getState().add(card),
    error: () => usePaymentCardStore.getState().error,
    changed: (id: string, value: string) => ({ ...card, id, name: value }),
  },
  {
    name: 'tags',
    seed: () => useTagStore.setState({ tags: [tag, { ...tag, id: 'b' }] }),
    rows: () => useTagStore.getState().tags,
    update: (id: string, value: string) => useTagStore.getState().update(id, { name: value }),
    remove: (id: string) => useTagStore.getState().remove(id),
    fetch: () => useTagStore.getState().fetch(),
    add: () => useTagStore.getState().add(tag),
    error: () => useTagStore.getState().error,
    changed: (id: string, value: string) => ({ ...tag, id, name: value }),
  },
  {
    name: 'payments',
    seed: () => usePaymentStore.setState({ payments: [payment, { ...payment, id: 'b' }] }),
    rows: () => usePaymentStore.getState().payments,
    update: (id: string, value: string) =>
      usePaymentStore.getState().updatePayment(id, { notes: value }),
    remove: (id: string) => usePaymentStore.getState().deletePayment(id),
    fetch: () => usePaymentStore.getState().fetchPayments(),
    add: () => usePaymentStore.getState().addPayment(payment),
    error: () => usePaymentStore.getState().error,
    changed: (id: string, value: string) => ({ ...payment, id, notes: value }),
  },
]

beforeEach(() => mockInvoke.mockReset())

for (const domain of domains) {
  describe(`${domain.name} request ordering`, () => {
    beforeEach(domain.seed)
    for (const failFirst of [true, false]) {
      it(`preserves another entity when ${failFirst ? 'failure' : 'success'} completes first`, async () => {
        const a = deferred<unknown>()
        const b = deferred<unknown>()
        mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
        const failed = domain.update('a', 'Failed').catch(() => undefined)
        const succeeded = domain.update('b', 'Saved')
        if (failFirst) {
          a.reject(new Error('failed'))
          await failed
          b.resolve(domain.changed('b', 'Saved'))
          await succeeded
        } else {
          b.resolve(domain.changed('b', 'Saved'))
          await succeeded
          a.reject(new Error('failed'))
          await failed
        }
        expect(domain.rows()).toContainEqual(domain.changed('a', 'Original'))
        expect(domain.rows()).toContainEqual(domain.changed('b', 'Saved'))
      })
    }
    it('ignores an older same-entity success', async () => {
      const a = deferred<unknown>()
      const b = deferred<unknown>()
      mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
      const first = domain.update('a', 'First')
      const second = domain.update('a', 'Second')
      b.resolve(domain.changed('a', 'Second'))
      await second
      a.resolve(domain.changed('a', 'First'))
      await first
      expect(domain.rows()).toContainEqual(domain.changed('a', 'Second'))
    })
    it('ignores an older same-entity failure', async () => {
      const a = deferred<unknown>()
      const b = deferred<unknown>()
      mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
      const first = domain.update('a', 'First').catch(() => undefined)
      const second = domain.update('a', 'Second')
      b.resolve(domain.changed('a', 'Second'))
      await second
      a.reject(new Error('failed'))
      await first
      expect(domain.rows()).toContainEqual(domain.changed('a', 'Second'))
    })
    for (const olderFirst of [true, false]) {
      it(`restores the authoritative earlier write when a later write fails (${olderFirst ? 'earlier' : 'later'} settles first)`, async () => {
        const a = deferred<unknown>()
        const b = deferred<unknown>()
        mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
        const first = domain.update('a', 'First')
        const second = domain.update('a', 'Second').catch(() => undefined)
        if (olderFirst) {
          a.resolve(domain.changed('a', 'Server first'))
          await first
          b.reject(new Error('failed'))
          await second
        } else {
          b.reject(new Error('failed'))
          await second
          a.resolve(domain.changed('a', 'Server first'))
          await first
        }
        expect(domain.rows()).toContainEqual(domain.changed('a', 'Server first'))
      })
      it(`restores the original entity when both writes fail (${olderFirst ? 'earlier' : 'later'} settles first)`, async () => {
        const a = deferred<unknown>()
        const b = deferred<unknown>()
        mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
        const first = domain.update('a', 'First').catch(() => undefined)
        const second = domain.update('a', 'Second').catch(() => undefined)
        if (olderFirst) {
          a.reject(new Error('failed'))
          await first
          b.reject(new Error('failed'))
          await second
        } else {
          b.reject(new Error('failed'))
          await second
          a.reject(new Error('failed'))
          await first
        }
        expect(domain.rows()).toContainEqual(domain.changed('a', 'Original'))
      })
    }
    it('does not undo a successful update when another deletion fails', async () => {
      const a = deferred<unknown>()
      const b = deferred<unknown>()
      mockInvoke.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise)
      const first = domain.remove('a').catch(() => undefined)
      const second = domain.update('b', 'Saved')
      b.resolve(domain.changed('b', 'Saved'))
      await second
      a.reject(new Error('failed'))
      await first
      expect(domain.rows()).toContainEqual(domain.changed('a', 'Original'))
      expect(domain.rows()).toContainEqual(domain.changed('b', 'Saved'))
    })
    it('does not resurrect an entity deleted while an update is in flight', async () => {
      const update = deferred<unknown>()
      const deletion = deferred<unknown>()
      mockInvoke.mockReturnValueOnce(update.promise).mockReturnValueOnce(deletion.promise)
      const updating = domain.update('a', 'Saved')
      const deleting = domain.remove('a')
      deletion.resolve(undefined)
      await deleting
      update.resolve(domain.changed('a', 'Saved'))
      await updating
      expect(domain.rows().some((row) => row.id === 'a')).toBe(false)
    })
    it('does not publish a fetch started before a mutation', async () => {
      const read = deferred<unknown>()
      const write = deferred<unknown>()
      mockInvoke.mockReturnValueOnce(read.promise).mockReturnValueOnce(write.promise)
      const fetching = domain.fetch()
      const updating = domain.update('a', 'Saved')
      write.resolve(domain.changed('a', 'Saved'))
      await updating
      read.resolve([domain.changed('a', 'Original')])
      await fetching
      expect(domain.rows()).toContainEqual(domain.changed('a', 'Saved'))
    })
    it('keeps a successful add when an earlier fetch rejects and surfaces the failure', async () => {
      const read = deferred<unknown>()
      const saved = domain.changed('created', 'Saved')
      mockInvoke.mockReturnValueOnce(read.promise).mockResolvedValueOnce(saved)
      const fetching = domain.fetch()
      await domain.add()
      read.reject(new Error('read unavailable'))
      await fetching
      expect(domain.rows()).toContainEqual(saved)
      expect(domain.error()).toContain('read unavailable')
    })
  })
}

it('serializes settings patches without overwriting newer optimistic values', async () => {
  const original = { id: 'singleton', ...DEFAULT_SETTINGS }
  useSettingsStore.setState({ settings: original })
  const first = deferred<typeof original>()
  const second = deferred<typeof original>()
  mockInvoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const a = useSettingsStore.getState().update({ currency: 'EUR' })
  const b = useSettingsStore.getState().update({ currency: 'GBP' })
  await Promise.resolve()
  expect(mockInvoke).toHaveBeenCalledTimes(1)
  first.resolve({ ...original, currency: 'EUR' })
  await a
  expect(useSettingsStore.getState().settings?.currency).toBe('GBP')
  second.resolve({ ...original, currency: 'GBP' })
  await b
  expect(useSettingsStore.getState().settings?.currency).toBe('GBP')
})

it('continues queued settings writes after a failure without restoring the failed patch', async () => {
  const original = { id: 'singleton', ...DEFAULT_SETTINGS }
  useSettingsStore.setState({ settings: original })
  const first = deferred<typeof original>()
  const second = deferred<typeof original>()
  mockInvoke.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  const a = useSettingsStore
    .getState()
    .update({ currency: 'EUR' })
    .catch(() => undefined)
  const b = useSettingsStore.getState().update({ theme: 'light' })
  first.reject(new Error('failed'))
  await a
  expect(useSettingsStore.getState().settings).toMatchObject({ currency: 'USD', theme: 'light' })
  second.resolve({ ...original, theme: 'light' })
  await b
})

it('does not publish settings fetched before a later settings write', async () => {
  const original = { id: 'singleton', ...DEFAULT_SETTINGS }
  useSettingsStore.setState({ settings: original })
  const read = deferred<typeof original>()
  mockInvoke
    .mockReturnValueOnce(read.promise)
    .mockResolvedValueOnce({ ...original, currency: 'EUR' })
  const fetching = useSettingsStore.getState().fetch()
  await useSettingsStore.getState().update({ currency: 'EUR' })
  read.resolve(original)
  await fetching
  expect(useSettingsStore.getState().settings?.currency).toBe('EUR')
})

it('rolls back unavailable settings writes and accepts the next patch', async () => {
  const original = { id: 'singleton', ...DEFAULT_SETTINGS }
  useSettingsStore.setState({ settings: original, error: null })
  const unavailable = deferred<typeof original>()
  mockInvoke.mockReturnValueOnce(unavailable.promise).mockResolvedValueOnce({
    ...original,
    monthly_budget: null,
    currency: 'EUR',
  })
  const failed = useSettingsStore.getState().update({ currency: 'GBP' })
  const rejection = expect(failed).rejects.toThrow('Web API unavailable')
  unavailable.reject(new Error('Web API unavailable: start the app with pnpm dev:web'))
  await rejection
  expect(useSettingsStore.getState().settings).toEqual(original)
  expect(useSettingsStore.getState().error).toContain('Web API unavailable')
  await useSettingsStore.getState().update({ currency: 'EUR', monthly_budget: null })
  expect(useSettingsStore.getState().settings).toMatchObject({
    currency: 'EUR',
    monthly_budget: null,
  })
  expect(useSettingsStore.getState().error).toBeNull()
})
