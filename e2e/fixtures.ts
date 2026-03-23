import { test as base } from '@playwright/test'

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

const MOCK_ANALYTICS_MONTHLY = [
  { month: '2026-01', total: 89.97, count: 5 },
  { month: '2026-02', total: 94.97, count: 5 },
  { month: '2026-03', total: 99.97, count: 6 },
]

const MOCK_ANALYTICS_YEAR_SUMMARY = {
  year: 2026,
  total_spent: 1079.64,
  monthly_average: 89.97,
  most_expensive_month: '2026-03',
  most_expensive_amount: 99.97,
  subscription_count: 6,
}

const MOCK_ANALYTICS_VELOCITY = {
  current_monthly: 99.97,
  previous_monthly: 89.97,
  change_percent: 11.1,
  trend: 'up',
}

const MOCK_ANALYTICS_CATEGORY = [
  { category_id: 'cat-streaming', category_name: 'Streaming', color: '#e50914', total: 35.98, percentage: 36.0 },
  { category_id: 'cat-music', category_name: 'Music', color: '#1db954', total: 19.99, percentage: 20.0 },
  { category_id: 'cat-gaming', category_name: 'Gaming', color: '#9147ff', total: 14.99, percentage: 15.0 },
  { category_id: 'cat-productivity', category_name: 'Productivity', color: '#0078d4', total: 29.01, percentage: 29.0 },
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

  const ANALYTICS_MONTHLY = ${JSON.stringify(MOCK_ANALYTICS_MONTHLY)};
  const ANALYTICS_YEAR_SUMMARY = ${JSON.stringify(MOCK_ANALYTICS_YEAR_SUMMARY)};
  const ANALYTICS_VELOCITY = ${JSON.stringify(MOCK_ANALYTICS_VELOCITY)};
  const ANALYTICS_CATEGORY = ${JSON.stringify(MOCK_ANALYTICS_CATEGORY)};

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
    // Small delay to simulate async behavior
    await new Promise(r => setTimeout(r, 5));

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

      case 'list_payments_by_month':
      case 'list_payments':
      case 'list_payments_with_details':
        return [];
      case 'mark_payment_paid':
      case 'skip_payment':
        return { id: 'pay-' + Date.now(), ...args };
      case 'is_payment_recorded':
        return false;

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
        return [];

      // Expiring trials
      case 'get_expiring_trials':
        return [];

      // System tray
      case 'update_tray_badge':
        return null;

      // Analytics
      case 'get_monthly_spending':
        return [...ANALYTICS_MONTHLY];
      case 'get_year_summary':
        return { ...ANALYTICS_YEAR_SUMMARY };
      case 'get_spending_velocity':
        return { ...ANALYTICS_VELOCITY };
      case 'get_category_spending':
        return [...ANALYTICS_CATEGORY];

      default:
        console.warn('[TAURI MOCK] Unhandled command:', cmd, args);
        return null;
    }
  };

  window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener = function() {};

  window.__TAURI_INTERNALS__.metadata = {
    currentWindow: { label: 'main' },
    currentWebview: { windowLabel: 'main', label: 'main' },
  };
`

/**
 * Extended Playwright test fixture that mocks Tauri IPC.
 * This lets E2E tests run against the Vite dev server without the Rust backend.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(MOCK_IPC_SCRIPT)
    await use(page)
  },
})

export { expect } from '@playwright/test'
