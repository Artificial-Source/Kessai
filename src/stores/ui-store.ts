import { create } from 'zustand'

type UiState = {
  sidebarCollapsed: boolean
  subscriptionDialogOpen: boolean
  editingSubscriptionId: string | null
  shortcutsDialogOpen: boolean

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  openSubscriptionDialog: (editId?: string) => void
  closeSubscriptionDialog: () => void
  openShortcutsDialog: () => void
  closeShortcutsDialog: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  subscriptionDialogOpen: false,
  editingSubscriptionId: null,
  shortcutsDialogOpen: false,

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
}))
