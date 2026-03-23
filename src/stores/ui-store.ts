import { create } from 'zustand'
import type { NormalizationPeriod } from '@/types/subscription'

const COST_NORMALIZATION_KEY = 'subby-cost-normalization'

function loadCostNormalization(): NormalizationPeriod {
  try {
    const saved = localStorage.getItem(COST_NORMALIZATION_KEY)
    if (
      saved === 'as-is' ||
      saved === 'daily' ||
      saved === 'weekly' ||
      saved === 'monthly' ||
      saved === 'yearly'
    ) {
      return saved
    }
  } catch {
    // ignore
  }
  return 'as-is'
}

type UiState = {
  sidebarCollapsed: boolean
  subscriptionDialogOpen: boolean
  editingSubscriptionId: string | null
  shortcutsDialogOpen: boolean
  costNormalization: NormalizationPeriod

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openSubscriptionDialog: (editId?: string) => void
  closeSubscriptionDialog: () => void
  openShortcutsDialog: () => void
  closeShortcutsDialog: () => void
  setCostNormalization: (period: NormalizationPeriod) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  subscriptionDialogOpen: false,
  editingSubscriptionId: null,
  shortcutsDialogOpen: false,
  costNormalization: loadCostNormalization(),

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  openSubscriptionDialog: (editId) =>
    set({
      subscriptionDialogOpen: true,
      editingSubscriptionId: editId || null,
    }),

  closeSubscriptionDialog: () =>
    set({
      subscriptionDialogOpen: false,
      editingSubscriptionId: null,
    }),

  openShortcutsDialog: () => set({ shortcutsDialogOpen: true }),

  closeShortcutsDialog: () => set({ shortcutsDialogOpen: false }),

  setCostNormalization: (period) => {
    try {
      localStorage.setItem(COST_NORMALIZATION_KEY, period)
    } catch {
      // ignore
    }
    set({ costNormalization: period })
  },
}))
