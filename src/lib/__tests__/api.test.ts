import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import type * as ApiModule from '../api'
import type { ApiCommands, BackupData } from '../api'

const newSubscription: ApiCommands['create_subscription']['args']['data'] = {
  name: 'Example',
  amount: 12,
  currency: 'USD',
  billing_cycle: 'monthly',
  billing_day: 15,
  category_id: null,
  color: null,
  notes: null,
  is_active: true,
  next_payment_date: '2026-03-15',
  status: 'active',
  shared_count: 1,
  is_pinned: false,
}
const backup: BackupData = {
  version: '1.0.0',
  exportedAt: '2026-03-01',
  subscriptions: [],
  categories: [],
  payments: [],
  settings: {
    theme: 'dark',
    currency: 'USD',
    display_exchange_rates: {},
    notification_enabled: false,
    notification_days_before: [],
    notification_advance_days: 1,
    notification_time: '09:00',
    reduce_motion: false,
    enable_transitions: true,
    enable_hover_effects: true,
    animation_speed: 'normal',
  },
}

let api: typeof ApiModule
const fetchMock = vi.fn<typeof fetch>()

beforeEach(async () => {
  vi.resetModules()
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
  fetchMock.mockReset()
  fetchMock.mockResolvedValue(
    new Response('{}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  )
  vi.stubGlobal('fetch', fetchMock)
  api = await import('../api')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('infers command-specific arguments and results', () => {
  expectTypeOf(api.apiInvoke<'list_subscriptions'>).returns.toEqualTypeOf<
    Promise<ApiCommands['list_subscriptions']['result']>
  >()
  expectTypeOf(api.apiInvoke<'list_payments_by_month'>).parameters.toEqualTypeOf<
    [command: 'list_payments_by_month', args: { year: number; month: number }]
  >()
  expectTypeOf(api.apiInvoke<'transition_subscription_status'>).parameters.toEqualTypeOf<
    [
      command: 'transition_subscription_status',
      args: ApiCommands['transition_subscription_status']['args'],
    ]
  >()
})

function expectRequest(url: string, method: string, body: unknown) {
  expect(fetchMock).toHaveBeenCalledWith(
    url,
    expect.objectContaining({
      method,
      body: JSON.stringify(body),
    })
  )
}

describe('apiInvoke web requests', () => {
  it('preserves bodyKey serialization for object request bodies', async () => {
    const data = newSubscription

    await api.apiInvoke('create_subscription', { data })

    expectRequest('/api/subscriptions', 'POST', data)
  })

  it('preserves bodyKey serialization for array request bodies', async () => {
    const subscriptionIds = ['sub-1', 'sub-2']

    await api.apiInvoke('list_latest_price_history', { subscriptionIds })

    expectRequest('/api/price-history/latest', 'POST', subscriptionIds)
  })

  it('preserves direct argument serialization for matching request bodies', async () => {
    const args = { name: 'Example', domain: 'example.com' }

    await api.apiInvoke('fetch_logo', args)

    expectRequest('/api/logos/fetch', 'POST', args)
  })

  it('serializes browser logo data without a desktop source path', async () => {
    await api.apiInvoke('save_logo', {
      data: 'data:image/png;base64,abc',
      sourcePath: '/must/not/be/sent.png',
      subscriptionId: 'sub-1',
    })

    expectRequest('/api/logos/save', 'POST', {
      data: 'data:image/png;base64,abc',
      subscription_id: 'sub-1',
    })
  })

  it('wraps subscription status in the REST request DTO', async () => {
    await api.apiInvoke('transition_subscription_status', {
      id: 'sub-1',
      status: 'paused',
    })

    expectRequest('/api/subscriptions/sub-1/status', 'POST', { status: 'paused' })
  })

  it('serializes mark-paid arguments with Rust DTO field names', async () => {
    await api.apiInvoke('mark_payment_paid', {
      subscriptionId: 'sub-1',
      dueDate: '2026-03-15',
      amount: 12.5,
    })

    expectRequest('/api/payments/mark-paid', 'POST', {
      subscription_id: 'sub-1',
      due_date: '2026-03-15',
      amount: 12.5,
    })
  })

  it('serializes skip-payment arguments with Rust DTO field names', async () => {
    await api.apiInvoke('skip_payment', {
      subscriptionId: 'sub-1',
      dueDate: '2026-03-15',
      amount: 12.5,
    })

    expectRequest('/api/payments/skip', 'POST', {
      subscription_id: 'sub-1',
      due_date: '2026-03-15',
      amount: 12.5,
    })
  })

  it('serializes the tag ID with the Rust DTO field name', async () => {
    await api.apiInvoke('add_subscription_tag', {
      subscriptionId: 'sub-1',
      tagId: 'tag-1',
    })

    expectRequest('/api/subscriptions/sub-1/tags', 'POST', { tag_id: 'tag-1' })
  })

  it('maps access status to its authenticated REST endpoint', async () => {
    await api.apiInvoke('get_access_status')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/access/status',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('serializes the import option with the Rust DTO field name', async () => {
    const data = backup

    await api.apiInvoke('import_data', { data, clearExisting: true })

    expectRequest('/api/import', 'POST', { data, clear_existing: true })
  })

  it('maps the authoritative calendar month query without a request body', async () => {
    await api.apiInvoke('list_calendar_payments', { year: 2026, month: 10 })
    expect(fetchMock).toHaveBeenCalledWith('/api/payments/calendar/2026/10', {
      headers: { 'Content-Type': 'application/json' },
      method: 'GET',
    })
  })

  it('sends an explicit null budget while omitting undefined patch keys', async () => {
    await api.apiInvoke('update_settings', {
      data: { monthly_budget: null, currency: undefined },
    })
    expectRequest('/api/settings', 'PUT', { monthly_budget: null })
  })

  it('returns undefined for an empty 204 response', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(api.apiInvoke('delete_subscription', { id: 'sub' })).resolves.toBeUndefined()
  })

  it('reports an HTML gateway failure even when HTTP has no status text', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('<html><body>Bad Gateway</body></html>', { status: 502 })
    )
    await expect(api.apiInvoke('get_settings')).rejects.toThrow('get_settings: HTTP 502')
  })
})

describe('complete HTTP command mapping', () => {
  const category = { name: 'Video', color: '#123456', icon: 'box' }
  const payment = {
    subscription_id: 'sub',
    amount: 12,
    paid_at: '2026-03-15',
    due_date: '2026-03-15',
    status: 'paid' as const,
  }
  const card = { name: 'Visa', card_type: 'credit' as const, color: '#123456' }
  const tag = { name: 'Home', color: '#123456' }
  const cases = [
    [
      'list_subscriptions',
      () => api.apiInvoke('list_subscriptions'),
      'GET',
      '/api/subscriptions',
      undefined,
    ],
    [
      'get_subscription',
      () => api.apiInvoke('get_subscription', { id: 'sub' }),
      'GET',
      '/api/subscriptions/sub',
      undefined,
    ],
    [
      'create_subscription',
      () => api.apiInvoke('create_subscription', { data: newSubscription }),
      'POST',
      '/api/subscriptions',
      newSubscription,
    ],
    [
      'update_subscription',
      () => api.apiInvoke('update_subscription', { id: 'sub', data: { amount: 15 } }),
      'PUT',
      '/api/subscriptions/sub',
      { amount: 15 },
    ],
    [
      'delete_subscription',
      () => api.apiInvoke('delete_subscription', { id: 'sub' }),
      'DELETE',
      '/api/subscriptions/sub',
      undefined,
    ],
    [
      'toggle_subscription_active',
      () => api.apiInvoke('toggle_subscription_active', { id: 'sub' }),
      'POST',
      '/api/subscriptions/sub/toggle',
      { id: 'sub' },
    ],
    [
      'toggle_subscription_pinned',
      () => api.apiInvoke('toggle_subscription_pinned', { id: 'sub' }),
      'POST',
      '/api/subscriptions/sub/pin',
      { id: 'sub' },
    ],
    [
      'transition_subscription_status',
      () => api.apiInvoke('transition_subscription_status', { id: 'sub', status: 'paused' }),
      'POST',
      '/api/subscriptions/sub/status',
      { status: 'paused' },
    ],
    [
      'cancel_subscription',
      () => api.apiInvoke('cancel_subscription', { id: 'sub', reason: 'Unused' }),
      'POST',
      '/api/subscriptions/sub/cancel',
      { id: 'sub', reason: 'Unused' },
    ],
    [
      'get_expiring_trials',
      () => api.apiInvoke('get_expiring_trials', {}),
      'GET',
      '/api/trials/expiring?days=7',
      undefined,
    ],
    [
      'mark_subscription_reviewed',
      () => api.apiInvoke('mark_subscription_reviewed', { id: 'sub' }),
      'POST',
      '/api/subscriptions/sub/review',
      { id: 'sub' },
    ],
    [
      'list_subscriptions_needing_review',
      () => api.apiInvoke('list_subscriptions_needing_review', {}),
      'GET',
      '/api/subscriptions/needs-review?days=30',
      undefined,
    ],
    [
      'list_categories',
      () => api.apiInvoke('list_categories'),
      'GET',
      '/api/categories',
      undefined,
    ],
    [
      'create_category',
      () => api.apiInvoke('create_category', { data: category }),
      'POST',
      '/api/categories',
      category,
    ],
    [
      'update_category',
      () => api.apiInvoke('update_category', { id: 'cat', data: category }),
      'PUT',
      '/api/categories/cat',
      category,
    ],
    [
      'delete_category',
      () => api.apiInvoke('delete_category', { id: 'cat' }),
      'DELETE',
      '/api/categories/cat',
      undefined,
    ],
    ['list_payments', () => api.apiInvoke('list_payments'), 'GET', '/api/payments', undefined],
    [
      'list_payments_by_month',
      () => api.apiInvoke('list_payments_by_month', { year: 2026, month: 3 }),
      'GET',
      '/api/payments/2026/3',
      undefined,
    ],
    [
      'list_payments_with_details',
      () => api.apiInvoke('list_payments_with_details', { year: 2026, month: 3 }),
      'GET',
      '/api/payments/2026/3/details',
      undefined,
    ],
    [
      'list_calendar_payments',
      () => api.apiInvoke('list_calendar_payments', { year: 2026, month: 3 }),
      'GET',
      '/api/payments/calendar/2026/3',
      undefined,
    ],
    [
      'create_payment',
      () => api.apiInvoke('create_payment', { data: payment }),
      'POST',
      '/api/payments',
      payment,
    ],
    [
      'update_payment',
      () => api.apiInvoke('update_payment', { id: 'pay', data: { amount: 15 } }),
      'PUT',
      '/api/payments/pay',
      { amount: 15 },
    ],
    [
      'delete_payment',
      () => api.apiInvoke('delete_payment', { id: 'pay' }),
      'DELETE',
      '/api/payments/pay',
      undefined,
    ],
    [
      'mark_payment_paid',
      () =>
        api.apiInvoke('mark_payment_paid', {
          subscriptionId: 'sub',
          dueDate: '2026-03-15',
          amount: 12,
        }),
      'POST',
      '/api/payments/mark-paid',
      { subscription_id: 'sub', due_date: '2026-03-15', amount: 12 },
    ],
    [
      'skip_payment',
      () =>
        api.apiInvoke('skip_payment', { subscriptionId: 'sub', dueDate: '2026-03-15', amount: 12 }),
      'POST',
      '/api/payments/skip',
      { subscription_id: 'sub', due_date: '2026-03-15', amount: 12 },
    ],
    [
      'is_payment_recorded',
      () => api.apiInvoke('is_payment_recorded', { subscriptionId: 'sub', dueDate: '2026-03-15' }),
      'GET',
      '/api/payments/check/sub/2026-03-15',
      undefined,
    ],
    [
      'list_payment_cards',
      () => api.apiInvoke('list_payment_cards'),
      'GET',
      '/api/cards',
      undefined,
    ],
    [
      'create_payment_card',
      () => api.apiInvoke('create_payment_card', { data: card }),
      'POST',
      '/api/cards',
      card,
    ],
    [
      'update_payment_card',
      () => api.apiInvoke('update_payment_card', { id: 'card', data: card }),
      'PUT',
      '/api/cards/card',
      card,
    ],
    [
      'delete_payment_card',
      () => api.apiInvoke('delete_payment_card', { id: 'card' }),
      'DELETE',
      '/api/cards/card',
      undefined,
    ],
    [
      'get_access_status',
      () => api.apiInvoke('get_access_status'),
      'GET',
      '/api/access/status',
      undefined,
    ],
    ['get_settings', () => api.apiInvoke('get_settings'), 'GET', '/api/settings', undefined],
    [
      'update_settings',
      () => api.apiInvoke('update_settings', { data: { currency: 'EUR' } }),
      'PUT',
      '/api/settings',
      { currency: 'EUR' },
    ],
    [
      'list_price_history',
      () => api.apiInvoke('list_price_history', { subscriptionId: 'sub' }),
      'GET',
      '/api/price-history/sub',
      undefined,
    ],
    [
      'get_recent_price_changes',
      () => api.apiInvoke('get_recent_price_changes', {}),
      'GET',
      '/api/price-history/recent?days=90',
      undefined,
    ],
    [
      'list_latest_price_history',
      () => api.apiInvoke('list_latest_price_history', { subscriptionIds: ['sub'] }),
      'POST',
      '/api/price-history/latest',
      ['sub'],
    ],
    ['list_tags', () => api.apiInvoke('list_tags'), 'GET', '/api/tags', undefined],
    ['create_tag', () => api.apiInvoke('create_tag', { data: tag }), 'POST', '/api/tags', tag],
    [
      'update_tag',
      () => api.apiInvoke('update_tag', { id: 'tag', data: tag }),
      'PUT',
      '/api/tags/tag',
      tag,
    ],
    [
      'delete_tag',
      () => api.apiInvoke('delete_tag', { id: 'tag' }),
      'DELETE',
      '/api/tags/tag',
      undefined,
    ],
    [
      'list_subscription_tags',
      () => api.apiInvoke('list_subscription_tags', { subscriptionId: 'sub' }),
      'GET',
      '/api/subscriptions/sub/tags',
      undefined,
    ],
    [
      'list_subscription_tags_batch',
      () => api.apiInvoke('list_subscription_tags_batch', { subscriptionIds: ['sub'] }),
      'POST',
      '/api/subscriptions/tags/batch',
      ['sub'],
    ],
    [
      'add_subscription_tag',
      () => api.apiInvoke('add_subscription_tag', { subscriptionId: 'sub', tagId: 'tag' }),
      'POST',
      '/api/subscriptions/sub/tags',
      { tag_id: 'tag' },
    ],
    [
      'remove_subscription_tag',
      () => api.apiInvoke('remove_subscription_tag', { subscriptionId: 'sub', tagId: 'tag' }),
      'DELETE',
      '/api/subscriptions/sub/tags/tag',
      undefined,
    ],
    ['export_data', () => api.apiInvoke('export_data'), 'GET', '/api/export', undefined],
    [
      'import_data',
      () => api.apiInvoke('import_data', { data: backup, clearExisting: false }),
      'POST',
      '/api/import',
      { data: backup, clear_existing: false },
    ],
    [
      'save_logo',
      () => api.apiInvoke('save_logo', { data: 'image', subscriptionId: 'sub' }),
      'POST',
      '/api/logos/save',
      { data: 'image', subscription_id: 'sub' },
    ],
    [
      'get_logo_base64',
      () => api.apiInvoke('get_logo_base64', { filename: 'image.png' }),
      'GET',
      '/api/logos/image.png',
      undefined,
    ],
    [
      'delete_logo',
      () => api.apiInvoke('delete_logo', { filename: 'image.png' }),
      'DELETE',
      '/api/logos/image.png',
      undefined,
    ],
    [
      'fetch_logo',
      () => api.apiInvoke('fetch_logo', { name: 'Example', domain: null }),
      'POST',
      '/api/logos/fetch',
      { name: 'Example', domain: null },
    ],
  ] as const

  it.each(cases)(
    '%s preserves its method, route and body',
    async (_name, request, method, url, body) => {
      await request()
      expect(fetchMock).toHaveBeenCalledWith(url, {
        headers: { 'Content-Type': 'application/json' },
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
    }
  )
})

describe('encoded REST path parameters', () => {
  const id = 'space 日本/with?query#fragment'
  const encoded = 'space%20%E6%97%A5%E6%9C%AC%2Fwith%3Fquery%23fragment'
  const cases = [
    [() => api.apiInvoke('get_subscription', { id }), `/api/subscriptions/${encoded}`],
    [
      () => api.apiInvoke('update_subscription', { id, data: { name: 'Updated' } }),
      `/api/subscriptions/${encoded}`,
    ],
    [() => api.apiInvoke('delete_subscription', { id }), `/api/subscriptions/${encoded}`],
    [
      () => api.apiInvoke('toggle_subscription_active', { id }),
      `/api/subscriptions/${encoded}/toggle`,
    ],
    [
      () => api.apiInvoke('toggle_subscription_pinned', { id }),
      `/api/subscriptions/${encoded}/pin`,
    ],
    [
      () => api.apiInvoke('transition_subscription_status', { id, status: 'paused' }),
      `/api/subscriptions/${encoded}/status`,
    ],
    [() => api.apiInvoke('cancel_subscription', { id }), `/api/subscriptions/${encoded}/cancel`],
    [
      () => api.apiInvoke('mark_subscription_reviewed', { id }),
      `/api/subscriptions/${encoded}/review`,
    ],
    [() => api.apiInvoke('update_category', { id, data: {} }), `/api/categories/${encoded}`],
    [() => api.apiInvoke('delete_category', { id }), `/api/categories/${encoded}`],
    [() => api.apiInvoke('update_payment', { id, data: {} }), `/api/payments/${encoded}`],
    [() => api.apiInvoke('delete_payment', { id }), `/api/payments/${encoded}`],
    [
      () => api.apiInvoke('is_payment_recorded', { subscriptionId: id, dueDate: '2026-10-21' }),
      `/api/payments/check/${encoded}/2026-10-21`,
    ],
    [() => api.apiInvoke('update_payment_card', { id, data: {} }), `/api/cards/${encoded}`],
    [() => api.apiInvoke('delete_payment_card', { id }), `/api/cards/${encoded}`],
    [
      () => api.apiInvoke('list_price_history', { subscriptionId: id }),
      `/api/price-history/${encoded}`,
    ],
    [() => api.apiInvoke('update_tag', { id, data: {} }), `/api/tags/${encoded}`],
    [() => api.apiInvoke('delete_tag', { id }), `/api/tags/${encoded}`],
    [
      () => api.apiInvoke('list_subscription_tags', { subscriptionId: id }),
      `/api/subscriptions/${encoded}/tags`,
    ],
    [
      () => api.apiInvoke('add_subscription_tag', { subscriptionId: id, tagId: id }),
      `/api/subscriptions/${encoded}/tags`,
    ],
    [
      () => api.apiInvoke('remove_subscription_tag', { subscriptionId: id, tagId: id }),
      `/api/subscriptions/${encoded}/tags/${encoded}`,
    ],
    [() => api.apiInvoke('get_logo_base64', { filename: id }), `/api/logos/${encoded}`],
    [() => api.apiInvoke('delete_logo', { filename: id }), `/api/logos/${encoded}`],
  ] as const

  it.each(cases)('keeps identifiers within one path segment (%#)', async (request, url) => {
    await request()
    expect(fetchMock.mock.calls[0][0]).toBe(url)
  })
})

describe('isWebApiUnavailableError', () => {
  it('detects transformed command-prefixed web API unavailable strings', () => {
    const error = 'Error: get_settings: Web API unavailable: start the app with pnpm dev:web'
    expect(api.isWebApiUnavailableError(error)).toBe(true)
  })

  it('detects direct Error objects with web API unavailable message', () => {
    const error = new Error('Web API unavailable: start the app with pnpm dev:web')
    expect(api.isWebApiUnavailableError(error)).toBe(true)
  })

  it.each(['Failed to fetch', 'NetworkError when attempting to fetch resource.', 'Load failed'])(
    'recognizes the browser network message %s',
    (message) => {
      expect(api.isWebApiUnavailableError(new TypeError(message))).toBe(true)
    }
  )
})
