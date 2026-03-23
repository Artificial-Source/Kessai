import { useMemo } from 'react'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'

export type CommandResultType = 'subscription' | 'page' | 'action'

export type CommandResult = {
  id: string
  type: CommandResultType
  title: string
  subtitle?: string
  icon: string
  /** For subscriptions: the subscription ID to edit */
  subscriptionId?: string
  /** For pages: the route path */
  route?: string
  /** For actions: the action key */
  action?: string
}

type CommandGroup = {
  type: CommandResultType
  label: string
  results: CommandResult[]
}

const PAGES: CommandResult[] = [
  { id: 'page-dashboard', type: 'page', title: 'Dashboard', subtitle: 'Overview and stats', icon: 'layout-dashboard', route: '/' },
  { id: 'page-subscriptions', type: 'page', title: 'Subscriptions', subtitle: 'Manage subscriptions', icon: 'credit-card', route: '/subscriptions' },
  { id: 'page-calendar', type: 'page', title: 'Calendar', subtitle: 'Payment schedule', icon: 'calendar', route: '/calendar' },
  { id: 'page-settings', type: 'page', title: 'Settings', subtitle: 'Preferences', icon: 'settings', route: '/settings' },
]

const ACTIONS: CommandResult[] = [
  { id: 'action-add-subscription', type: 'action', title: 'Add Subscription', subtitle: 'Create a new subscription', icon: 'plus', action: 'add-subscription' },
  { id: 'action-toggle-theme', type: 'action', title: 'Toggle Theme', subtitle: 'Switch between dark and light', icon: 'sun-moon', action: 'toggle-theme' },
]

function matchesQuery(text: string, query: string): boolean {
  return text.toLowerCase().includes(query.toLowerCase())
}

export function useCommandPalette(query: string): CommandGroup[] {
  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const categories = useCategoryStore((s) => s.categories)
  const currency = useSettingsStore((s) => s.settings?.currency ?? 'USD')

  return useMemo(() => {
    const trimmed = query.trim()
    const groups: CommandGroup[] = []

    // Subscription results
    const subResults: CommandResult[] = subscriptions
      .filter((sub) => {
        if (!trimmed) return true
        // Match against name and category name
        const category = categories.find((c) => c.id === sub.category_id)
        return (
          matchesQuery(sub.name, trimmed) ||
          (category && matchesQuery(category.name, trimmed))
        )
      })
      .slice(0, 8)
      .map((sub) => {
        const category = categories.find((c) => c.id === sub.category_id)
        return {
          id: `sub-${sub.id}`,
          type: 'subscription' as const,
          title: sub.name,
          subtitle: `${formatCurrency(sub.amount, currency as CurrencyCode)}/${sub.billing_cycle}${category ? ` · ${category.name}` : ''}`,
          icon: 'credit-card',
          subscriptionId: sub.id,
        }
      })

    if (subResults.length > 0) {
      groups.push({ type: 'subscription', label: 'Subscriptions', results: subResults })
    }

    // Page results
    const pageResults = PAGES.filter((page) => {
      if (!trimmed) return true
      return matchesQuery(page.title, trimmed) || (page.subtitle && matchesQuery(page.subtitle, trimmed))
    })

    if (pageResults.length > 0) {
      groups.push({ type: 'page', label: 'Pages', results: pageResults })
    }

    // Action results
    const actionResults = ACTIONS.filter((action) => {
      if (!trimmed) return true
      return matchesQuery(action.title, trimmed) || (action.subtitle && matchesQuery(action.subtitle, trimmed))
    })

    if (actionResults.length > 0) {
      groups.push({ type: 'action', label: 'Actions', results: actionResults })
    }

    return groups
  }, [query, subscriptions, categories, currency])
}
