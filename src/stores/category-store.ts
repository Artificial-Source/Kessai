import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
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

const byName = (a: Category, b: Category) => a.name.localeCompare(b.name)

export const useCategoryStore = create<CategoryState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let pending = 0
  type Mutation = {
    data: Partial<Category> | null
    settled: boolean
    failed: boolean
    result?: Category
  }
  const mutations = new Map<string, { base: Category | undefined; entries: Mutation[] }>()
  const mutate = async (
    id: string,
    data: Partial<Category> | null,
    request: () => Promise<Category | void>
  ) => {
    const journal = mutations.get(id) ?? {
      base: get().categories.find((c) => c.id === id),
      entries: [],
    }
    const mutation: Mutation = { data, settled: false, failed: false }
    journal.entries.push(mutation)
    mutations.set(id, journal)
    generation++
    pending++
    const publish = () => {
      let category = journal.base
      for (const entry of journal.entries) {
        if (entry.failed) continue
        category = entry.settled
          ? entry.result
          : entry.data === null
            ? undefined
            : category
              ? { ...category, ...entry.data }
              : undefined
      }
      set((state) => ({
        categories: [
          ...state.categories.filter((c) => c.id !== id),
          ...(category ? [category] : []),
        ].sort(byName),
      }))
    }
    publish()
    try {
      mutation.result = (await request()) || undefined
    } catch (error) {
      mutation.failed = true
      set({ error: String(error) })
      throw error
    } finally {
      mutation.settled = true
      publish()
      pending--
      generation++
      if (journal.entries.every((entry) => entry.settled)) mutations.delete(id)
    }
  }
  return {
    categories: [],
    isLoading: false,
    error: null,
    fetch: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = pending === 0
      set({ isLoading: true, error: null })
      try {
        const categories = await invoke('list_categories')
        if (request === fetchRequest && started === generation && canPublish) set({ categories })
      } catch (error) {
        if (request === fetchRequest) set({ error: String(error) })
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },
    add: async (category) => {
      const optimisticId = crypto.randomUUID()
      const optimistic: Category = {
        ...category,
        id: optimisticId,
        is_default: false,
        created_at: new Date().toISOString(),
      }
      generation++
      pending++
      set((state) => ({ categories: [...state.categories, optimistic].sort(byName) }))
      try {
        const created = await invoke('create_category', { data: category })
        set((state) => ({
          categories: state.categories
            .map((c) => (c.id === optimisticId ? created : c))
            .sort(byName),
        }))
      } catch (error) {
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== optimisticId),
          error: String(error),
        }))
        throw error
      } finally {
        pending--
        generation++
      }
    },
    update: async (id, data) => {
      if (!get().categories.some((c) => c.id === id)) return
      await mutate(id, data, () => invoke('update_category', { id, data }))
    },
    remove: async (id) => {
      if (get().categories.find((c) => c.id === id)?.is_default)
        throw new Error('Cannot delete default category')
      await mutate(id, null, () => invoke('delete_category', { id }))
    },
    getById: (id) => get().categories.find((c) => c.id === id),
  }
})
