import { create } from 'zustand'
import { invoke } from '@tauri-apps/api/core'
import type { Category, NewCategory } from '@/types/category'

type CategoryState = {
  categories: Category[]
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  add: (category: NewCategory) => Promise<void>
  update: (id: string, data: Partial<Category>) => Promise<void>
  remove: (id: string) => Promise<void>
  getById: (id: string) => Category | undefined
}

export const useCategoryStore = create<CategoryState>((set, get) => ({
  categories: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const cats = await invoke<Category[]>('list_categories')
      set({ categories: cats, isLoading: false })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  add: async (category) => {
    const optimisticId = crypto.randomUUID()
    const now = new Date().toISOString()

    const newCategory: Category = {
      id: optimisticId,
      name: category.name,
      color: category.color,
      icon: category.icon,
      is_default: false,
      created_at: now,
    }

    set((state) => ({
      categories: [...state.categories, newCategory].sort((a, b) => a.name.localeCompare(b.name)),
    }))

    try {
      const created = await invoke<Category>('create_category', { data: category })
      set((state) => ({
        categories: state.categories
          .map((c) => (c.id === optimisticId ? created : c))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
    } catch (error) {
      set((state) => ({
        categories: state.categories.filter((c) => c.id !== optimisticId),
      }))
      console.error('Failed to add category:', error)
      throw error
    }
  },

  update: async (id, data) => {
    const previousCategories = get().categories
    const category = previousCategories.find((c) => c.id === id)
    if (!category) return

    set((state) => ({
      categories: state.categories
        .map((c) => (c.id === id ? { ...c, ...data } : c))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))

    try {
      const updated = await invoke<Category>('update_category', { id, data })
      set((state) => ({
        categories: state.categories
          .map((c) => (c.id === id ? updated : c))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
    } catch (error) {
      set({ categories: previousCategories })
      console.error('Failed to update category:', error)
      throw error
    }
  },

  remove: async (id) => {
    const category = get().categories.find((c) => c.id === id)
    if (category?.is_default) {
      throw new Error('Cannot delete default category')
    }

    const previousCategories = get().categories

    set((state) => ({
      categories: state.categories.filter((c) => c.id !== id),
    }))

    try {
      await invoke('delete_category', { id })
    } catch (error) {
      set({ categories: previousCategories })
      console.error('Failed to remove category:', error)
      throw error
    }
  },

  getById: (id) => get().categories.find((c) => c.id === id),
}))
