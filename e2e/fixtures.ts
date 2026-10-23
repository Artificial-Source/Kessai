import { test as base, expect, type Page } from '@playwright/test'

// Mock data matching the Rust backend's default state
const MOCK_SETTINGS = {
  id: 'singleton',
  theme: 'dark',
  currency: 'USD',
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
  notification_advance_days: 1,
  notification_time: '09:00',
  monthly_budget: null,
  reduce_motion: false,
  enable_transitions: true,
  enable_hover_effects: true,
  animation_speed: 'normal',
}

const MOCK_CATEGORIES = [
  { id: 'cat-streaming', name: 'Streaming', color: '#e50914', icon: 'tv', is_default: true },
  { id: 'cat-music', name: 'Music', color: '#1db954', icon: 'music', is_default: true },
  { id: 'cat-gaming', name: 'Gaming', color: '#9147ff', icon: 'gamepad-2', is_default: true },
  {
    id: 'cat-productivity',
    name: 'Productivity',
    color: '#0078d4',
    icon: 'briefcase',
    is_default: true,
  },
  { id: 'cat-cloud', name: 'Cloud Storage', color: '#00a4ef', icon: 'cloud', is_default: true },
  { id: 'cat-news', name: 'News & Media', color: '#ff6600', icon: 'newspaper', is_default: true },
  { id: 'cat-fitness', name: 'Fitness', color: '#fc5c65', icon: 'heart', is_default: true },
  {
    id: 'cat-education',
    name: 'Education',
    color: '#f5a623',
    icon: 'graduation-cap',
    is_default: true,
  },
  { id: 'cat-other', name: 'Other', color: '#6b7280', icon: 'box', is_default: true },
]

// IPC mock handler script injected into the browser
const MOCK_IPC_SCRIPT = `
  const SETTINGS = ${JSON.stringify(MOCK_SETTINGS)};
  const CATEGORIES = ${JSON.stringify(MOCK_CATEGORIES)};
  const SUBSCRIPTIONS = [];
  const PAYMENTS = [];
  const CARDS = [];
  const TAGS = [];
  const SUBSCRIPTION_TAGS = {};
  // seedSubscriptions() registers a later init script that calls this before the app loads.
  window.__KESSAI_E2E_SEED__ = (subscriptions) => { SUBSCRIPTIONS.push(...subscriptions); };
  const PRIVATE_WEB_ACCESS = {
    state: 'stopped',
    enabled: false,
    port: 3000,
    serveCommand: 'tailscale serve --bg http://127.0.0.1:3000',
  };
  let privateAccessKeyGeneration = 0;
  let AUTOSTART_ENABLED = false;

  function advancePaymentDate(dueDate, subscription) {
    const date = new Date(dueDate + 'T12:00:00Z');
    if (subscription.billing_cycle === 'weekly') {
      date.setUTCDate(date.getUTCDate() + 7);
    } else {
      const months = subscription.billing_cycle === 'yearly' ? 12
        : subscription.billing_cycle === 'quarterly' ? 3 : 1;
      const day = subscription.billing_day || date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + months);
      const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      date.setUTCDate(Math.min(day, lastDay));
    }
    return date.toISOString().slice(0, 10);
  }

  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = window.__TAURI_EVENT_PLUGIN_INTERNALS__ || {};

  const callbacks = new Map();

  window.__TAURI_INTERNALS__.transformCallback = function(callback, once) {
    const id = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    callbacks.set(id, (data) => {
      if (once) callbacks.delete(id);
      return callback && callback(data);
    });
    return id;
  };

  window.__TAURI_INTERNALS__.unregisterCallback = function(id) {
    callbacks.delete(id);
  };

  window.__TAURI_INTERNALS__.runCallback = function(id, data) {
    const cb = callbacks.get(id);
    if (cb) cb(data);
  };

  window.__TAURI_INTERNALS__.callbacks = callbacks;

  window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
    switch (cmd) {
      case 'get_settings':
        return { ...SETTINGS };
      case 'update_settings':
        Object.assign(SETTINGS, args?.data || {});
        return { ...SETTINGS };

      case 'list_categories':
        return [...CATEGORIES];
      case 'create_category':
        const newCat = { id: 'cat-' + Date.now(), ...args?.data, is_default: false };
        CATEGORIES.push(newCat);
        return newCat;
      case 'update_category':
        return CATEGORIES.find(c => c.id === args?.id) || null;
      case 'delete_category':
        return null;

      case 'list_subscriptions':
        return [...SUBSCRIPTIONS];
      case 'create_subscription': {
        const sub = {
          id: 'sub-' + Date.now(),
          ...args?.data,
          is_active: args?.data?.is_active ?? true,
          status: args?.data?.status ?? 'active',
          status_changed_at: new Date().toISOString(),
          shared_count: args?.data?.shared_count ?? 1,
          is_pinned: args?.data?.is_pinned ?? false,
          cancellation_reason: null,
          cancelled_at: null,
          last_reviewed_at: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        SUBSCRIPTIONS.push(sub);
        return sub;
      }
      case 'update_subscription': {
        const idx = SUBSCRIPTIONS.findIndex(s => s.id === args?.id);
        if (idx >= 0) {
          Object.assign(SUBSCRIPTIONS[idx], args?.data || {}, { updated_at: new Date().toISOString() });
          return { ...SUBSCRIPTIONS[idx] };
        }
        return null;
      }
      case 'delete_subscription': {
        const delIdx = SUBSCRIPTIONS.findIndex(s => s.id === args?.id);
        if (delIdx >= 0) SUBSCRIPTIONS.splice(delIdx, 1);
        return null;
      }
      case 'toggle_subscription_active': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) s.is_active = !s.is_active;
        return s ? { ...s } : null;
      }
      case 'toggle_subscription_pinned': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) s.is_pinned = !s.is_pinned;
        return s ? { ...s } : null;
      }
      case 'cancel_subscription': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) {
          s.status = 'cancelled';
          s.is_active = false;
          s.cancellation_reason = args?.reason || null;
          s.cancelled_at = new Date().toISOString();
        }
        return s ? { ...s } : null;
      }
      case 'transition_subscription_status': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) {
          s.status = args?.status || s.status;
          s.status_changed_at = new Date().toISOString();
        }
        return s ? { ...s } : null;
      }
      case 'mark_subscription_reviewed': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) {
          s.last_reviewed_at = new Date().toISOString();
        }
        return s ? { ...s } : null;
      }
      case 'list_subscriptions_needing_review':
        return SUBSCRIPTIONS.filter(s =>
          s.is_active && s.status === 'active' && (
            !s.last_reviewed_at ||
            (Date.now() - new Date(s.last_reviewed_at).getTime()) > (args?.days || 30) * 24 * 60 * 60 * 1000
          )
        );

      // Tags
      case 'list_tags':
        return [...TAGS];
      case 'create_tag': {
        const tag = { id: 'tag-' + Date.now(), ...args?.data, created_at: new Date().toISOString() };
        TAGS.push(tag);
        return tag;
      }
      case 'update_tag': {
        const t = TAGS.find(t => t.id === args?.id);
        if (t) Object.assign(t, args?.data || {});
        return t ? { ...t } : null;
      }
      case 'delete_tag': {
        const ti = TAGS.findIndex(t => t.id === args?.id);
        if (ti >= 0) TAGS.splice(ti, 1);
        // Also clean up subscription tags
        for (const subId in SUBSCRIPTION_TAGS) {
          SUBSCRIPTION_TAGS[subId] = (SUBSCRIPTION_TAGS[subId] || []).filter(id => id !== args?.id);
        }
        return null;
      }
      case 'add_subscription_tag': {
        const subId = args?.subscriptionId;
        const tagId = args?.tagId;
        if (subId && tagId) {
          if (!SUBSCRIPTION_TAGS[subId]) SUBSCRIPTION_TAGS[subId] = [];
          if (!SUBSCRIPTION_TAGS[subId].includes(tagId)) {
            SUBSCRIPTION_TAGS[subId].push(tagId);
          }
        }
        return null;
      }
      case 'remove_subscription_tag': {
        const subId2 = args?.subscriptionId;
        const tagId2 = args?.tagId;
        if (subId2 && tagId2 && SUBSCRIPTION_TAGS[subId2]) {
          SUBSCRIPTION_TAGS[subId2] = SUBSCRIPTION_TAGS[subId2].filter(id => id !== tagId2);
        }
        return null;
      }
      case 'list_subscription_tags': {
        const subId3 = args?.subscriptionId;
        const tagIds = SUBSCRIPTION_TAGS[subId3] || [];
        return TAGS.filter(t => tagIds.includes(t.id));
      }
      case 'list_subscription_tags_batch':
        return (args?.subscriptionIds || []).flatMap(subscription_id =>
          (SUBSCRIPTION_TAGS[subscription_id] || []).map(tag_id => ({ subscription_id, tag_id }))
        );

      case 'list_payments':
        return [...PAYMENTS];
      case 'list_payments_by_month':
      case 'list_payments_with_details':
        return PAYMENTS.filter(p => p.due_date.startsWith(
          args.year + '-' + String(args.month).padStart(2, '0')
        ));
      case 'list_calendar_payments': {
        const month = args.year + '-' + String(args.month).padStart(2, '0');
        const occurrences = [];
        for (const subscription of SUBSCRIPTIONS) {
          const recorded = PAYMENTS.filter(p => p.subscription_id === subscription.id && p.due_date.startsWith(month));
          const occurrence = (due_date, payment) => ({
            subscription_id: subscription.id,
            name: subscription.name,
            category_id: subscription.category_id,
            currency: subscription.currency,
            billing_cycle: subscription.billing_cycle,
            status: subscription.status,
            is_active: subscription.is_active,
            logo_url: subscription.logo_url,
            projected_amount: subscription.amount,
            due_date,
            payment,
          });
          occurrences.push(...recorded.map(payment => occurrence(payment.due_date, payment)));
          if (!subscription.is_active || !['active', 'trial', 'grace_period'].includes(subscription.status)) continue;
          let due = subscription.next_payment_date;
          while (due && due.slice(0, 7) <= month) {
            if (due.startsWith(month) && !recorded.some(p => p.due_date === due)) {
              occurrences.push(occurrence(due, null));
            }
            due = advancePaymentDate(due, subscription);
          }
        }
        return occurrences;
      }
      case 'mark_payment_paid':
      case 'skip_payment': {
        const subscription = SUBSCRIPTIONS.find(s => s.id === args.subscriptionId);
        if (!subscription) throw new Error('Subscription not found');
        const status = cmd === 'mark_payment_paid' ? 'paid' : 'skipped';
        const existing = PAYMENTS.find(p => p.subscription_id === subscription.id && p.due_date === args.dueDate);
        if (existing) {
          if (existing.status !== status || existing.amount !== args.amount) throw new Error('Payment already recorded');
          return { ...existing };
        }
        const now = new Date().toISOString();
        const payment = {
          id: 'pay-' + crypto.randomUUID(),
          subscription_id: subscription.id,
          amount: args.amount,
          paid_at: now,
          due_date: args.dueDate,
          status,
          notes: null,
          created_at: now,
        };
        PAYMENTS.push(payment);
        if (status === 'paid' && subscription.next_payment_date === args.dueDate) {
          subscription.next_payment_date = advancePaymentDate(args.dueDate, subscription);
          subscription.updated_at = now;
        }
        return { ...payment };
      }
      case 'is_payment_recorded':
        return PAYMENTS.some(p => p.subscription_id === args.subscriptionId && p.due_date === args.dueDate);

      case 'list_payment_cards':
        return [...CARDS];
      case 'create_payment_card':
        const card = { id: 'card-' + Date.now(), ...args?.data };
        CARDS.push(card);
        return card;
      case 'update_payment_card':
        return CARDS.find(c => c.id === args?.id) || null;
      case 'delete_payment_card':
        return null;

      case 'export_data':
        return JSON.stringify({ subscriptions: SUBSCRIPTIONS, categories: CATEGORIES, settings: SETTINGS, payments: PAYMENTS, payment_cards: CARDS });
      case 'import_data':
        return { subscriptions_imported: 0, categories_imported: 0, payments_imported: 0, cards_imported: 0 };

      case 'get_private_web_access_status':
        return { ...PRIVATE_WEB_ACCESS };
      case 'apply_private_web_access': {
        const port = args?.port;
        if (!Number.isInteger(port) || port < 1024 || port > 65535) {
          throw new Error('Port must be between 1024 and 65535');
        }
        const wasEnabled = PRIVATE_WEB_ACCESS.enabled;
        PRIVATE_WEB_ACCESS.enabled = Boolean(args?.enabled);
        PRIVATE_WEB_ACCESS.port = port;
        PRIVATE_WEB_ACCESS.state = PRIVATE_WEB_ACCESS.enabled ? 'running' : 'stopped';
        PRIVATE_WEB_ACCESS.serveCommand = 'tailscale serve --bg http://127.0.0.1:' + port;
        if (PRIVATE_WEB_ACCESS.enabled && !wasEnabled) {
          privateAccessKeyGeneration += 1;
          PRIVATE_WEB_ACCESS.accessKey = 'e2e-private-access-key-' + privateAccessKeyGeneration;
        } else if (!PRIVATE_WEB_ACCESS.enabled) {
          delete PRIVATE_WEB_ACCESS.accessKey;
        }
        return { ...PRIVATE_WEB_ACCESS };
      }

      case 'plugin:autostart|is_enabled':
        return AUTOSTART_ENABLED;
      case 'plugin:autostart|enable':
        AUTOSTART_ENABLED = true;
        return null;
      case 'plugin:autostart|disable':
        AUTOSTART_ENABLED = false;
        return null;

      // Logo/file operations
      case 'get_logo_path':
      case 'save_logo':
      case 'get_logo_base64':
      case 'delete_logo':
      case 'fetch_logo':
        return null;

      // Price history
      case 'list_price_history':
      case 'get_recent_price_changes':
      case 'list_latest_price_history':
        return [];

      // Expiring trials
      case 'get_expiring_trials':
        return [];

      // System tray
      case 'update_tray_badge':
        return null;

      default:
        console.error('Unhandled mock command: ' + cmd);
        throw new Error('Unhandled mock command: ' + cmd);
    }
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};

  window.__TAURI_INTERNALS__.metadata = {
    currentWindow: { label: 'main' },
    currentWebview: { windowLabel: 'main', label: 'main' },
  };
`

export async function openNewSubscriptionForm(page: Page) {
  await page.getByRole('button', { name: /add subscription/i }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Start from scratch', exact: true }).click()
  await expect(dialog.getByLabel(/^name/i)).toBeVisible()

  return dialog
}

type SeedSubscription = { id: string; name: string } & Record<string, unknown>

declare global {
  interface Window {
    /** Defined by MOCK_IPC_SCRIPT; appends subscriptions to the mock backend. */
    __KESSAI_E2E_SEED__: (subscriptions: Record<string, unknown>[]) => void
  }
}

/** Starts the page with these subscriptions in the IPC mock (defaults: active, monthly USD). */
export async function seedSubscriptions(page: Page, subscriptions: SeedSubscription[]) {
  const now = new Date().toISOString()
  const complete = subscriptions.map((subscription) => ({
    amount: 9.99,
    currency: 'USD',
    billing_cycle: 'monthly',
    billing_day: null,
    category_id: null,
    color: null,
    logo_url: null,
    notes: null,
    is_active: true,
    next_payment_date: null,
    status: 'active',
    status_changed_at: now,
    trial_end_date: null,
    shared_count: 1,
    is_pinned: false,
    cancellation_reason: null,
    cancelled_at: null,
    last_reviewed_at: null,
    card_id: null,
    created_at: now,
    updated_at: now,
    ...subscription,
  }))
  await page.addInitScript((list) => window.__KESSAI_E2E_SEED__(list), complete)
}

/**
 * Extended Playwright test fixture that mocks Tauri IPC.
 * This lets E2E tests run against the Vite dev server without the Rust backend.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const unhandledCommands: string[] = []
    page.on('console', (message) => {
      if (message.text().startsWith('Unhandled mock command: ')) {
        unhandledCommands.push(message.text())
      }
    })
    await page.addInitScript(MOCK_IPC_SCRIPT)
    await use(page)
    expect(unhandledCommands, 'Every invoked Tauri command needs an explicit mock handler').toEqual(
      []
    )
  },
})

export { expect }
