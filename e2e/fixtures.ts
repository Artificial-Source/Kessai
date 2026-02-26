import { test as base } from '@playwright/test'

// Mock data matching the Rust backend's default state
const MOCK_SETTINGS = {
  id: 'singleton',
  theme: 'dark',
  currency: 'USD',
  notification_enabled: true,
  notification_days_before: [1, 3, 7],
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        SUBSCRIPTIONS.push(sub);
        return sub;
      }
      case 'update_subscription':
        return SUBSCRIPTIONS.find(s => s.id === args?.id) || null;
      case 'delete_subscription':
        const idx = SUBSCRIPTIONS.findIndex(s => s.id === args?.id);
        if (idx >= 0) SUBSCRIPTIONS.splice(idx, 1);
        return null;
      case 'toggle_subscription_active': {
        const s = SUBSCRIPTIONS.find(s => s.id === args?.id);
        if (s) s.is_active = !s.is_active;
        return s || null;
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
        return null;

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
