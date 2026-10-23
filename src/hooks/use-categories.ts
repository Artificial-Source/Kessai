import { useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useCategoryStore } from '@/stores/category-store'

export function useCategories() {
  const { categories, isLoading, error, fetch, add, update, remove, getById } = useCategoryStore(
    useShallow((state) => ({
      categories: state.categories,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      add: state.add,
      update: state.update,
      remove: state.remove,
      getById: state.getById,
    }))
  )

  // Retry only on a new mount or an explicit refresh, never on an error/loading change.
  useEffect(() => {
    void fetch()
  }, [fetch])

  const defaultCategories = useMemo(() => categories.filter((c) => c.is_default), [categories])
  const customCategories = useMemo(() => categories.filter((c) => !c.is_default), [categories])

  return {
    categories,
    defaultCategories,
    customCategories,
    isLoading,
    error,
    add,
    update,
    remove,
    getById,
    refresh: fetch,
  }
}
