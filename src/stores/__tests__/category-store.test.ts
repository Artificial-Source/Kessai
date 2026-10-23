import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCategoryStore } from '../category-store'

const mockCategories = [
  {
    id: 'cat-streaming',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'play-circle',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-music',
    name: 'Music',
    color: '#f59e0b',
    icon: 'music',
    is_default: true,
    created_at: '2024-01-01T00:00:00.000Z',
  },
  {
    id: 'cat-custom',
    name: 'Custom Category',
    color: '#10b981',
    icon: 'box',
    is_default: false,
    created_at: '2024-01-15T00:00:00.000Z',
  },
]

const mockInvoke = vi.fn()

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

describe('useCategoryStore', () => {
  beforeEach(() => {
    useCategoryStore.setState({
      categories: [],
      isLoading: false,
      error: null,
    })
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue(mockCategories)
  })

  describe('fetch', () => {
    it('fetches categories and updates state', async () => {
      await useCategoryStore.getState().fetch()

      expect(mockInvoke).toHaveBeenCalledWith('list_categories')
      const state = useCategoryStore.getState()
      expect(state.categories).toHaveLength(3)
      expect(state.categories[0].name).toBe('Streaming')
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('returns booleans for is_default', async () => {
      await useCategoryStore.getState().fetch()

      const state = useCategoryStore.getState()
      expect(typeof state.categories[0].is_default).toBe('boolean')
      expect(state.categories[0].is_default).toBe(true)
      expect(state.categories[2].is_default).toBe(false)
    })

    it('sets loading state during fetch', async () => {
      const fetchPromise = useCategoryStore.getState().fetch()
      expect(useCategoryStore.getState().isLoading).toBe(true)
      await fetchPromise
      expect(useCategoryStore.getState().isLoading).toBe(false)
    })

    it('handles fetch errors', async () => {
      mockInvoke.mockRejectedValue(new Error('Database error'))

      await useCategoryStore.getState().fetch()

      const state = useCategoryStore.getState()
      expect(state.error).toBe('Error: Database error')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('add', () => {
    it('adds a new category optimistically', async () => {
      const created = {
        id: 'cat-new',
        name: 'New Category',
        color: '#ef4444',
        icon: 'star',
        is_default: false,
        created_at: '2024-01-20T00:00:00.000Z',
      }
      mockInvoke.mockResolvedValue(created)

      const newCategory = {
        name: 'New Category',
        color: '#ef4444',
        icon: 'star',
      }

      await useCategoryStore.getState().add(newCategory)

      expect(mockInvoke).toHaveBeenCalledWith('create_category', { data: newCategory })
      const state = useCategoryStore.getState()
      expect(state.categories.some((c) => c.name === 'New Category')).toBe(true)
    })

    it('rolls back on add failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Insert failed'))

      const newCategory = {
        name: 'Failed Category',
        color: '#ef4444',
        icon: 'star',
      }

      await expect(useCategoryStore.getState().add(newCategory)).rejects.toThrow('Insert failed')
      const state = useCategoryStore.getState()
      expect(state.categories.some((c) => c.name === 'Failed Category')).toBe(false)
    })
  })

  describe('update', () => {
    beforeEach(() => {
      useCategoryStore.setState({
        categories: [...mockCategories],
        isLoading: false,
        error: null,
      })
    })

    it('updates an existing category optimistically', async () => {
      const updated = { ...mockCategories[2], name: 'Updated Category' }
      mockInvoke.mockResolvedValue(updated)

      await useCategoryStore.getState().update('cat-custom', { name: 'Updated Category' })

      expect(mockInvoke).toHaveBeenCalledWith('update_category', {
        id: 'cat-custom',
        data: { name: 'Updated Category' },
      })
      const state = useCategoryStore.getState()
      expect(state.categories.find((c) => c.id === 'cat-custom')?.name).toBe('Updated Category')
    })

    it('rolls back on update failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Update failed'))

      await expect(
        useCategoryStore.getState().update('cat-custom', { name: 'Failed Update' })
      ).rejects.toThrow('Update failed')
      const state = useCategoryStore.getState()
      expect(state.categories.find((c) => c.id === 'cat-custom')?.name).toBe('Custom Category')
    })
  })

  describe('remove', () => {
    beforeEach(() => {
      useCategoryStore.setState({
        categories: [...mockCategories],
        isLoading: false,
        error: null,
      })
    })

    it('removes a custom category optimistically', async () => {
      mockInvoke.mockResolvedValue(undefined)

      await useCategoryStore.getState().remove('cat-custom')

      expect(mockInvoke).toHaveBeenCalledWith('delete_category', { id: 'cat-custom' })
      const state = useCategoryStore.getState()
      expect(state.categories.some((c) => c.id === 'cat-custom')).toBe(false)
    })

    it('throws error when trying to remove default category', async () => {
      await expect(useCategoryStore.getState().remove('cat-streaming')).rejects.toThrow(
        'Cannot delete default category'
      )
    })

    it('rolls back on remove failure', async () => {
      mockInvoke.mockRejectedValue(new Error('Delete failed'))

      await expect(useCategoryStore.getState().remove('cat-custom')).rejects.toThrow(
        'Delete failed'
      )
      const state = useCategoryStore.getState()
      expect(state.categories.some((c) => c.id === 'cat-custom')).toBe(true)
    })
  })

  describe('getById', () => {
    beforeEach(() => {
      useCategoryStore.setState({
        categories: [...mockCategories],
        isLoading: false,
        error: null,
      })
    })

    it('returns category by id', () => {
      const category = useCategoryStore.getState().getById('cat-streaming')
      expect(category).toBeDefined()
      expect(category?.name).toBe('Streaming')
    })

    it('returns undefined for non-existent id', () => {
      const category = useCategoryStore.getState().getById('non-existent')
      expect(category).toBeUndefined()
    })
  })
})
