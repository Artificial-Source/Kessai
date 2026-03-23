/**
 * API adapter that works in both Tauri (IPC) and Web (REST) modes.
 * Automatically detects the environment and routes calls accordingly.
 */

// Detect if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window

// Lazy import Tauri invoke to avoid errors in browser
let tauriInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null = null

if (isTauri) {
  import('@tauri-apps/api/core').then((mod) => {
    tauriInvoke = mod.invoke
  })
}

async function webFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error?: string }).error || res.statusText)
  }
  return res.json() as Promise<T>
}

const API_MAP: Record<
  string,
  { method: string; path: (a: Record<string, unknown>) => string; bodyKey?: string }
> = {
  // Subscriptions
  list_subscriptions: { method: 'GET', path: () => '/api/subscriptions' },
  get_subscription: { method: 'GET', path: (a) => `/api/subscriptions/${a.id}` },
  create_subscription: { method: 'POST', path: () => '/api/subscriptions', bodyKey: 'data' },
  update_subscription: {
    method: 'PUT',
    path: (a) => `/api/subscriptions/${a.id}`,
    bodyKey: 'data',
  },
  delete_subscription: { method: 'DELETE', path: (a) => `/api/subscriptions/${a.id}` },
  toggle_subscription_active: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${a.id}/toggle`,
  },
  transition_subscription_status: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${a.id}/status`,
    bodyKey: 'status',
  },
  get_expiring_trials: {
    method: 'GET',
    path: (a) => `/api/trials/expiring?days=${(a.days as number | undefined) ?? 7}`,
  },

  // Categories
  list_categories: { method: 'GET', path: () => '/api/categories' },
  create_category: { method: 'POST', path: () => '/api/categories', bodyKey: 'data' },
  update_category: { method: 'PUT', path: (a) => `/api/categories/${a.id}`, bodyKey: 'data' },
  delete_category: { method: 'DELETE', path: (a) => `/api/categories/${a.id}` },

  // Payments
  list_payments: { method: 'GET', path: () => '/api/payments' },
  list_payments_by_month: {
    method: 'GET',
    path: (a) => `/api/payments/${a.year}/${a.month}`,
  },
  list_payments_with_details: {
    method: 'GET',
    path: (a) => `/api/payments/${a.year}/${a.month}/details`,
  },
  create_payment: { method: 'POST', path: () => '/api/payments', bodyKey: 'data' },
  update_payment: { method: 'PUT', path: (a) => `/api/payments/${a.id}`, bodyKey: 'data' },
  delete_payment: { method: 'DELETE', path: (a) => `/api/payments/${a.id}` },
  mark_payment_paid: { method: 'POST', path: () => '/api/payments/mark-paid' },
  skip_payment: { method: 'POST', path: () => '/api/payments/skip' },
  is_payment_recorded: {
    method: 'GET',
    path: (a) => `/api/payments/check/${a.subscriptionId}/${a.dueDate}`,
  },

  // Payment Cards
  list_payment_cards: { method: 'GET', path: () => '/api/cards' },
  create_payment_card: { method: 'POST', path: () => '/api/cards', bodyKey: 'data' },
  update_payment_card: { method: 'PUT', path: (a) => `/api/cards/${a.id}`, bodyKey: 'data' },
  delete_payment_card: { method: 'DELETE', path: (a) => `/api/cards/${a.id}` },

  // Settings
  get_settings: { method: 'GET', path: () => '/api/settings' },
  update_settings: { method: 'PUT', path: () => '/api/settings', bodyKey: 'data' },

  // Price History
  list_price_history: {
    method: 'GET',
    path: (a) => `/api/price-history/${a.subscriptionId}`,
  },
  get_recent_price_changes: {
    method: 'GET',
    path: (a) => `/api/price-history/recent?days=${(a.days as number | undefined) ?? 90}`,
  },

  // Tags
  list_tags: { method: 'GET', path: () => '/api/tags' },
  create_tag: { method: 'POST', path: () => '/api/tags', bodyKey: 'data' },
  update_tag: { method: 'PUT', path: (a) => `/api/tags/${a.id}`, bodyKey: 'data' },
  delete_tag: { method: 'DELETE', path: (a) => `/api/tags/${a.id}` },
  list_subscription_tags: {
    method: 'GET',
    path: (a) => `/api/subscriptions/${a.subscriptionId}/tags`,
  },
  add_subscription_tag: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${a.subscriptionId}/tags`,
  },
  remove_subscription_tag: {
    method: 'DELETE',
    path: (a) => `/api/subscriptions/${a.subscriptionId}/tags/${a.tagId}`,
  },

  // Data Management
  export_data: { method: 'GET', path: () => '/api/export' },
  import_data: { method: 'POST', path: () => '/api/import' },

  // Logo management
  save_logo: { method: 'POST', path: () => '/api/logos/save' },
  get_logo_base64: { method: 'GET', path: (a) => `/api/logos/${a.filename}` },
  delete_logo: { method: 'DELETE', path: (a) => `/api/logos/${a.filename}` },
  fetch_logo: { method: 'POST', path: () => '/api/logos/fetch' },
}

export async function apiInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // In Tauri mode, use native IPC
  if (isTauri && tauriInvoke) {
    return tauriInvoke(command, args) as Promise<T>
  }

  // In web mode, use REST API
  const mapping = API_MAP[command]
  if (!mapping) {
    throw new Error(`Unknown command: ${command}. Not mapped for web mode.`)
  }

  const { method, path, bodyKey } = mapping
  const url = path(args || {})

  const options: RequestInit = { method }
  if (method !== 'GET' && method !== 'DELETE' && args) {
    options.body = JSON.stringify(bodyKey ? args[bodyKey] : args)
  }

  return webFetch<T>(url, options)
}
