/**
 * API adapter that works in both Tauri (IPC) and Web (REST) modes.
 * Automatically detects the environment and routes calls accordingly.
 * REST identifiers are encoded as single path segments. JSON bodies retain
 * explicit null fields and omit undefined fields, matching partial-update DTOs.
 */
import { logger } from '@/lib/logger'
import type { Category, NewCategory } from '@/types/category'
import type {
  CalendarOccurrence,
  Payment,
  PaymentFormData,
  PaymentWithSubscription,
} from '@/types/payment'
import type { PaymentCard, PaymentCardFormData } from '@/types/payment-card'
import type { Settings } from '@/types/settings'
import type { NewSubscription, Subscription, SubscriptionStatus } from '@/types/subscription'
import type { NewTag, SubscriptionTagLink, Tag } from '@/types/tag'

export type PriceChange = {
  id: string
  subscription_id: string
  old_amount: number
  new_amount: number
  old_currency: string
  new_currency: string
  changed_at: string
}

export type BackupData = {
  version: string
  exportedAt: string
  subscriptions: Subscription[]
  categories: Category[]
  payments: Payment[]
  payment_cards?: PaymentCard[]
  price_history?: PriceChange[]
  tags?: Tag[]
  subscription_tags?: SubscriptionTagLink[]
  settings: Omit<Settings, 'id'>
}

export type ImportResult = { success: boolean; message: string }
type Command<Args, Result> = { args: Args; result: Result }
type Id = { id: string }
type Month = { year: number; month: number }
type PaymentOccurrence = { subscriptionId: string; dueDate: string; amount: number }
type TagLink = { subscriptionId: string; tagId: string }
type NewPayment = Omit<PaymentFormData, 'notes'> & { notes?: string | null }
type NewCard = Omit<PaymentCardFormData, 'last_four' | 'credit_limit'> & {
  last_four?: string | null
  credit_limit?: number | null
}

export type ApiCommands = {
  list_subscriptions: Command<void, Subscription[]>
  get_subscription: Command<Id, Subscription>
  create_subscription: Command<{ data: NewSubscription }, Subscription>
  update_subscription: Command<Id & { data: Partial<Subscription> }, Subscription>
  delete_subscription: Command<Id, void>
  toggle_subscription_active: Command<Id, Subscription>
  toggle_subscription_pinned: Command<Id, Subscription>
  transition_subscription_status: Command<Id & { status: SubscriptionStatus }, Subscription>
  cancel_subscription: Command<Id & { reason?: string | null }, Subscription>
  get_expiring_trials: Command<{ days?: number }, Subscription[]>
  mark_subscription_reviewed: Command<Id, Subscription>
  list_subscriptions_needing_review: Command<{ days?: number }, Subscription[]>
  list_categories: Command<void, Category[]>
  create_category: Command<{ data: NewCategory }, Category>
  update_category: Command<Id & { data: Partial<Category> }, Category>
  delete_category: Command<Id, void>
  list_payments: Command<void, Payment[]>
  list_payments_by_month: Command<Month, Payment[]>
  list_payments_with_details: Command<Month, PaymentWithSubscription[]>
  list_calendar_payments: Command<Month, CalendarOccurrence[]>
  create_payment: Command<{ data: NewPayment }, Payment>
  update_payment: Command<Id & { data: Partial<NewPayment> }, Payment>
  delete_payment: Command<Id, void>
  mark_payment_paid: Command<PaymentOccurrence, Payment>
  skip_payment: Command<PaymentOccurrence, Payment>
  is_payment_recorded: Command<Omit<PaymentOccurrence, 'amount'>, boolean>
  list_payment_cards: Command<void, PaymentCard[]>
  create_payment_card: Command<{ data: NewCard }, PaymentCard>
  update_payment_card: Command<Id & { data: Partial<NewCard> }, PaymentCard>
  delete_payment_card: Command<Id, void>
  get_access_status: Command<
    void,
    {
      server_mode: 'standalone' | 'private_hosted' | 'tailscale_hosted'
      connection: 'local' | 'tailscale'
      tailscale_login: string | null
    }
  >
  get_settings: Command<void, Settings>
  update_settings: Command<{ data: Partial<Settings> }, Settings>
  list_price_history: Command<{ subscriptionId: string }, PriceChange[]>
  get_recent_price_changes: Command<{ days?: number }, PriceChange[]>
  list_latest_price_history: Command<{ subscriptionIds: string[] }, PriceChange[]>
  list_tags: Command<void, Tag[]>
  create_tag: Command<{ data: NewTag }, Tag>
  update_tag: Command<Id & { data: Partial<Pick<Tag, 'name' | 'color'>> }, Tag>
  delete_tag: Command<Id, void>
  list_subscription_tags: Command<{ subscriptionId: string }, Tag[]>
  list_subscription_tags_batch: Command<{ subscriptionIds: string[] }, SubscriptionTagLink[]>
  add_subscription_tag: Command<TagLink, void>
  remove_subscription_tag: Command<TagLink, void>
  export_data: Command<void, BackupData>
  import_data: Command<{ data: unknown; clearExisting: boolean }, ImportResult>
  save_logo: Command<{ data?: string; sourcePath?: string; subscriptionId: string }, string>
  get_logo_base64: Command<{ filename: string }, string>
  delete_logo: Command<{ filename: string }, void>
  fetch_logo: Command<{ name: string; domain?: string | null }, string | null>
  update_tray_badge: Command<void, void>
}

// Lazy import Tauri invoke — resolve once, then cache the result
let resolvedInvoke: ((cmd: string, args?: Record<string, unknown>) => Promise<unknown>) | null =
  null
let invokeResolved = false

async function getTauriInvoke() {
  if (invokeResolved) return resolvedInvoke
  try {
    const mod = await import('@tauri-apps/api/core')
    // Test that invoke actually works (not just that the module loaded)
    if (mod.invoke && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      resolvedInvoke = mod.invoke
    }
  } catch {
    // Not in Tauri environment
  }
  invokeResolved = true
  return resolvedInvoke
}

async function webFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const fallback = `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
    const err: unknown = await res.json().catch(() => null)
    const message =
      err && typeof err === 'object' && 'error' in err && typeof err.error === 'string'
        ? err.error
        : fallback
    throw new Error(message || fallback)
  }

  if (res.status === 204) {
    return undefined as T
  }

  return res.json() as Promise<T>
}

export function isWebApiUnavailableError(error: unknown): boolean {
  if (typeof window === 'undefined' || '__TAURI_INTERNALS__' in window) {
    return false
  }

  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('Web API unavailable:') ||
    message.includes('Failed to fetch') ||
    message.includes('NetworkError') ||
    message.includes('Load failed') ||
    message.includes('ERR_CONNECTION_REFUSED')
  )
}

interface ApiMapping {
  method: string
  path: (args: Record<string, unknown>) => string
  bodyKey?: string
  serializeBody?: (args: Record<string, unknown>) => unknown
}

// Encode each dynamic segment, never the route separators or query delimiters.
const pathSegment = (value: unknown): string => encodeURIComponent(String(value))

const API_MAP: Record<Exclude<keyof ApiCommands, 'update_tray_badge'>, ApiMapping> = {
  // Subscriptions
  list_subscriptions: { method: 'GET', path: () => '/api/subscriptions' },
  get_subscription: { method: 'GET', path: (a) => `/api/subscriptions/${pathSegment(a.id)}` },
  create_subscription: { method: 'POST', path: () => '/api/subscriptions', bodyKey: 'data' },
  update_subscription: {
    method: 'PUT',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}`,
    bodyKey: 'data',
  },
  delete_subscription: { method: 'DELETE', path: (a) => `/api/subscriptions/${pathSegment(a.id)}` },
  toggle_subscription_active: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}/toggle`,
  },
  toggle_subscription_pinned: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}/pin`,
  },
  transition_subscription_status: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}/status`,
    serializeBody: (a) => ({ status: a.status }),
  },
  cancel_subscription: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}/cancel`,
  },
  get_expiring_trials: {
    method: 'GET',
    path: (a) => `/api/trials/expiring?days=${(a.days as number | undefined) ?? 7}`,
  },
  mark_subscription_reviewed: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.id)}/review`,
  },
  list_subscriptions_needing_review: {
    method: 'GET',
    path: (a) => `/api/subscriptions/needs-review?days=${(a.days as number | undefined) ?? 30}`,
  },

  // Categories
  list_categories: { method: 'GET', path: () => '/api/categories' },
  create_category: { method: 'POST', path: () => '/api/categories', bodyKey: 'data' },
  update_category: {
    method: 'PUT',
    path: (a) => `/api/categories/${pathSegment(a.id)}`,
    bodyKey: 'data',
  },
  delete_category: { method: 'DELETE', path: (a) => `/api/categories/${pathSegment(a.id)}` },

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
  list_calendar_payments: {
    method: 'GET',
    path: (a) => `/api/payments/calendar/${a.year}/${a.month}`,
  },
  create_payment: { method: 'POST', path: () => '/api/payments', bodyKey: 'data' },
  update_payment: {
    method: 'PUT',
    path: (a) => `/api/payments/${pathSegment(a.id)}`,
    bodyKey: 'data',
  },
  delete_payment: { method: 'DELETE', path: (a) => `/api/payments/${pathSegment(a.id)}` },
  mark_payment_paid: {
    method: 'POST',
    path: () => '/api/payments/mark-paid',
    serializeBody: (a) => ({
      subscription_id: a.subscriptionId,
      due_date: a.dueDate,
      amount: a.amount,
    }),
  },
  skip_payment: {
    method: 'POST',
    path: () => '/api/payments/skip',
    serializeBody: (a) => ({
      subscription_id: a.subscriptionId,
      due_date: a.dueDate,
      amount: a.amount,
    }),
  },
  is_payment_recorded: {
    method: 'GET',
    path: (a) => `/api/payments/check/${pathSegment(a.subscriptionId)}/${pathSegment(a.dueDate)}`,
  },

  // Payment Cards
  list_payment_cards: { method: 'GET', path: () => '/api/cards' },
  create_payment_card: { method: 'POST', path: () => '/api/cards', bodyKey: 'data' },
  update_payment_card: {
    method: 'PUT',
    path: (a) => `/api/cards/${pathSegment(a.id)}`,
    bodyKey: 'data',
  },
  delete_payment_card: { method: 'DELETE', path: (a) => `/api/cards/${pathSegment(a.id)}` },

  // Access and settings
  get_access_status: { method: 'GET', path: () => '/api/access/status' },
  get_settings: { method: 'GET', path: () => '/api/settings' },
  update_settings: { method: 'PUT', path: () => '/api/settings', bodyKey: 'data' },

  // Price History
  list_price_history: {
    method: 'GET',
    path: (a) => `/api/price-history/${pathSegment(a.subscriptionId)}`,
  },
  get_recent_price_changes: {
    method: 'GET',
    path: (a) => `/api/price-history/recent?days=${(a.days as number | undefined) ?? 90}`,
  },
  list_latest_price_history: {
    method: 'POST',
    path: () => '/api/price-history/latest',
    bodyKey: 'subscriptionIds',
  },

  // Tags
  list_tags: { method: 'GET', path: () => '/api/tags' },
  create_tag: { method: 'POST', path: () => '/api/tags', bodyKey: 'data' },
  update_tag: { method: 'PUT', path: (a) => `/api/tags/${pathSegment(a.id)}`, bodyKey: 'data' },
  delete_tag: { method: 'DELETE', path: (a) => `/api/tags/${pathSegment(a.id)}` },
  list_subscription_tags: {
    method: 'GET',
    path: (a) => `/api/subscriptions/${pathSegment(a.subscriptionId)}/tags`,
  },
  list_subscription_tags_batch: {
    method: 'POST',
    path: () => '/api/subscriptions/tags/batch',
    bodyKey: 'subscriptionIds',
  },
  add_subscription_tag: {
    method: 'POST',
    path: (a) => `/api/subscriptions/${pathSegment(a.subscriptionId)}/tags`,
    serializeBody: (a) => ({ tag_id: a.tagId }),
  },
  remove_subscription_tag: {
    method: 'DELETE',
    path: (a) => `/api/subscriptions/${pathSegment(a.subscriptionId)}/tags/${pathSegment(a.tagId)}`,
  },

  // Data Management
  export_data: { method: 'GET', path: () => '/api/export' },
  import_data: {
    method: 'POST',
    path: () => '/api/import',
    serializeBody: (a) => ({ data: a.data, clear_existing: a.clearExisting }),
  },

  // Logo management
  save_logo: {
    method: 'POST',
    path: () => '/api/logos/save',
    serializeBody: (a) => ({ data: a.data, subscription_id: a.subscriptionId }),
  },
  get_logo_base64: { method: 'GET', path: (a) => `/api/logos/${pathSegment(a.filename)}` },
  delete_logo: { method: 'DELETE', path: (a) => `/api/logos/${pathSegment(a.filename)}` },
  fetch_logo: { method: 'POST', path: () => '/api/logos/fetch' },
}

export async function apiInvoke<C extends keyof ApiCommands>(
  command: C,
  ...parameters: ApiCommands[C]['args'] extends void
    ? [args?: undefined]
    : Record<string, never> extends ApiCommands[C]['args']
      ? [args?: ApiCommands[C]['args']]
      : [args: ApiCommands[C]['args']]
): Promise<ApiCommands[C]['result']> {
  const args = parameters[0] as Record<string, unknown> | undefined
  // Try Tauri IPC first (works in desktop app)
  const invoke = await getTauriInvoke()
  if (invoke) {
    try {
      const result = await (invoke(command, args) as Promise<ApiCommands[C]['result']>)
      logger.debug('api', `${command}: ok`)
      return result
    } catch (err) {
      logger.error('api', `${command} failed`, err)
      throw err
    }
  }

  // In web mode, use REST API
  const mapping = (API_MAP as Partial<Record<keyof ApiCommands, ApiMapping>>)[command]
  if (!mapping) {
    const err = new Error(`Unknown command: ${command}. Not mapped for web mode.`)
    logger.error('api', `${command} failed`, err)
    throw err
  }

  const { method, path, bodyKey, serializeBody } = mapping
  const url = path(args || {})

  const options: RequestInit = { method }
  if (method !== 'GET' && method !== 'DELETE' && args) {
    const body = serializeBody ? serializeBody(args) : bodyKey ? args[bodyKey] : args
    options.body = JSON.stringify(body)
  }

  try {
    const result = await webFetch<ApiCommands[C]['result']>(url, options)
    logger.debug('api', `${command}: ok`)
    return result
  } catch (err) {
    logger.error('api', `${command} failed`, err)
    if (isWebApiUnavailableError(err)) {
      throw new Error(`Web API unavailable: start the app with pnpm dev:web`)
    }
    throw new Error(`${command}: ${err instanceof Error ? err.message : String(err)}`)
  }
}
