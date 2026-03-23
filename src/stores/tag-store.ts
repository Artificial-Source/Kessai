import { create } from 'zustand'
import { apiInvoke as invoke } from '@/lib/api'
import type { Tag, NewTag } from '@/types/tag'

type TagState = {
  tags: Tag[]
  isLoading: boolean
  error: string | null

  fetch: () => Promise<void>
  add: (tag: NewTag) => Promise<Tag>
  update: (id: string, data: Partial<Pick<Tag, 'name' | 'color'>>) => Promise<void>
  remove: (id: string) => Promise<void>
  addToSubscription: (subscriptionId: string, tagId: string) => Promise<void>
  removeFromSubscription: (subscriptionId: string, tagId: string) => Promise<void>
  fetchForSubscription: (subscriptionId: string) => Promise<Tag[]>
}

export const useTagStore = create<TagState>((set, get) => ({
  tags: [],
  isLoading: false,
  error: null,

  fetch: async () => {
    set({ isLoading: true, error: null })
    try {
      const tags = await invoke<Tag[]>('list_tags')
      set({ tags, isLoading: false })
    } catch (e) {
      set({ error: String(e), isLoading: false })
    }
  },

  add: async (tag) => {
    const created = await invoke<Tag>('create_tag', { data: tag })
    set((state) => ({
      tags: [...state.tags, created].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    return created
  },

  update: async (id, data) => {
    const previousTags = get().tags

    set((state) => ({
      tags: state.tags
        .map((t) => (t.id === id ? { ...t, ...data } : t))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))

    try {
      const updated = await invoke<Tag>('update_tag', { id, data })
      set((state) => ({
        tags: state.tags
          .map((t) => (t.id === id ? updated : t))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
    } catch (error) {
      set({ tags: previousTags })
      console.error('Failed to update tag:', error)
      throw error
    }
  },

  remove: async (id) => {
    const previousTags = get().tags

    set((state) => ({
      tags: state.tags.filter((t) => t.id !== id),
    }))

    try {
      await invoke('delete_tag', { id })
    } catch (error) {
      set({ tags: previousTags })
      console.error('Failed to remove tag:', error)
      throw error
    }
  },

  addToSubscription: async (subscriptionId, tagId) => {
    await invoke('add_subscription_tag', {
      subscriptionId,
      tagId,
    })
  },

  removeFromSubscription: async (subscriptionId, tagId) => {
    await invoke('remove_subscription_tag', {
      subscriptionId,
      tagId,
    })
  },

  fetchForSubscription: async (subscriptionId) => {
    return await invoke<Tag[]>('list_subscription_tags', {
      subscriptionId,
    })
  },
}))
