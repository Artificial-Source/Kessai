import { describe, it, expect, beforeEach } from 'vitest'
import { useUiStore } from '../ui-store'

describe('useUiStore', () => {
  beforeEach(() => {
    useUiStore.setState({
      sidebarCollapsed: false,
      subscriptionDialogOpen: false,
      editingSubscriptionId: null,
    })
  })

  describe('toggleSidebar', () => {
    it('toggles sidebar from collapsed to expanded', () => {
      useUiStore.setState({ sidebarCollapsed: true })

      useUiStore.getState().toggleSidebar()

      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })

    it('toggles sidebar from expanded to collapsed', () => {
      useUiStore.getState().toggleSidebar()

      expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    })

    it('toggles twice returns to original state', () => {
      useUiStore.getState().toggleSidebar()
      useUiStore.getState().toggleSidebar()

      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
  })

  describe('setSidebarCollapsed', () => {
    it('sets sidebar to collapsed', () => {
      useUiStore.getState().setSidebarCollapsed(true)
      expect(useUiStore.getState().sidebarCollapsed).toBe(true)
    })

    it('sets sidebar to expanded', () => {
      useUiStore.setState({ sidebarCollapsed: true })
      useUiStore.getState().setSidebarCollapsed(false)
      expect(useUiStore.getState().sidebarCollapsed).toBe(false)
    })
  })

  describe('openSubscriptionDialog', () => {
    it('opens dialog without editId', () => {
      useUiStore.getState().openSubscriptionDialog()

      const state = useUiStore.getState()
      expect(state.subscriptionDialogOpen).toBe(true)
      expect(state.editingSubscriptionId).toBeNull()
    })

    it('opens dialog with editId', () => {
      useUiStore.getState().openSubscriptionDialog('sub-123')

      const state = useUiStore.getState()
      expect(state.subscriptionDialogOpen).toBe(true)
      expect(state.editingSubscriptionId).toBe('sub-123')
    })
  })

  describe('closeSubscriptionDialog', () => {
    it('closes dialog and resets editId', () => {
      useUiStore.setState({
        subscriptionDialogOpen: true,
        editingSubscriptionId: 'sub-123',
      })

      useUiStore.getState().closeSubscriptionDialog()

      const state = useUiStore.getState()
      expect(state.subscriptionDialogOpen).toBe(false)
      expect(state.editingSubscriptionId).toBeNull()
    })

    it('is idempotent when already closed', () => {
      useUiStore.getState().closeSubscriptionDialog()

      const state = useUiStore.getState()
      expect(state.subscriptionDialogOpen).toBe(false)
      expect(state.editingSubscriptionId).toBeNull()
    })
  })
})
