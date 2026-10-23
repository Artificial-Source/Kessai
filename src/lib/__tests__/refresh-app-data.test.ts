import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshAppData, AppDataRefreshError } from '../refresh-app-data'
import { useSettingsStore } from '@/stores/settings-store'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { useTagStore } from '@/stores/tag-store'
import { usePaymentStore } from '@/stores/payment-store'
import { DEFAULT_SETTINGS } from '@/types/settings'

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiInvoke: (...args: unknown[]) => mockInvoke(...args) }))

beforeEach(() => {
  mockInvoke.mockReset()
  useSettingsStore.setState({ error: null })
  useSubscriptionStore.setState({ error: null })
  useCategoryStore.setState({ error: null })
  usePaymentCardStore.setState({ error: null })
  useTagStore.setState({ error: null })
  usePaymentStore.setState({ error: null })
})

describe('refreshAppData', () => {
  it('starts every restored domain in parallel and refreshes all cached records', async () => {
    const resolvers: (() => void)[] = []
    mockInvoke.mockImplementation(
      (command: string) =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve(
              command === 'get_settings'
                ? { id: 'singleton', ...DEFAULT_SETTINGS, theme: 'light' }
                : []
            )
          )
        })
    )
    usePaymentStore.setState({
      calendarMonths: { '2026-10': { occurrences: [], isLoading: false, error: 'old' } },
    })
    const refreshing = refreshAppData()
    await Promise.resolve()
    expect(mockInvoke.mock.calls.map(([command]) => command).sort()).toEqual(
      [
        'get_settings',
        'list_subscriptions',
        'list_subscriptions_needing_review',
        'list_categories',
        'list_payment_cards',
        'list_tags',
        'list_payments',
      ].sort()
    )
    for (const resolve of resolvers) resolve()
    await refreshing
    expect(useSettingsStore.getState().settings?.theme).toBe('light')
    expect(useSubscriptionStore.getState().needingReview).toEqual([])
    expect(usePaymentStore.getState().calendarMonths).toEqual({})
  })

  it('waits for all domains and reports both rejected and error-state fetches together', async () => {
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'get_settings') throw new Error('settings offline')
      if (command === 'list_tags') throw new Error('tags offline')
      return []
    })
    const failure = await refreshAppData().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AppDataRefreshError)
    expect(failure).toMatchObject({
      errors: expect.arrayContaining([expect.any(Error), expect.any(Error)]),
    })
    expect(String(failure)).toContain('settings offline')
    expect(String(failure)).toContain('tags offline')
    expect(mockInvoke).toHaveBeenCalledWith('list_payment_cards')
    expect(mockInvoke).toHaveBeenCalledWith('list_payments')
  })

  it('refreshes healthy domains and names the single failed domain', async () => {
    useCategoryStore.setState({
      categories: [
        {
          id: 'old',
          name: 'Old',
          color: '#123456',
          icon: 'box',
          is_default: false,
          created_at: '',
        },
      ],
    })
    useSettingsStore.setState({ settings: { id: 'singleton', ...DEFAULT_SETTINGS } })
    mockInvoke.mockImplementation(async (command: string) => {
      if (command === 'list_tags') throw new Error('tags unavailable')
      if (command === 'get_settings')
        return { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'EUR' }
      return []
    })
    const error = await refreshAppData().catch((error: unknown) => error)
    expect(error).toBeInstanceOf(AppDataRefreshError)
    expect((error as AppDataRefreshError).errors).toHaveLength(1)
    expect((error as AppDataRefreshError).errors[0].message).toContain('tags unavailable')
    expect(useSettingsStore.getState().settings?.currency).toBe('EUR')
    expect(useCategoryStore.getState().categories).toEqual([])
    expect(usePaymentStore.getState().payments).toEqual([])
  })

  it.each([
    ['list_subscriptions', 'subscriptions'],
    ['list_subscriptions_needing_review', 'subscription reviews'],
  ])('attributes %s failure only to %s', async (command, domain) => {
    mockInvoke.mockImplementation(async (current: string) => {
      if (current === command) throw new Error('Unavailable')
      if (current === 'get_settings') return { id: 'singleton', ...DEFAULT_SETTINGS }
      return []
    })
    const failure = await refreshAppData().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(AppDataRefreshError)
    expect((failure as AppDataRefreshError).errors).toHaveLength(1)
    expect((failure as AppDataRefreshError).errors[0].message).toMatch(new RegExp(`^${domain}:`))
  })
})
