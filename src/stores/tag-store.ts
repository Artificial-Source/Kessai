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
  fetchForSubscriptions: (subscriptionIds: string[]) => Promise<Record<string, string[]>>
}

const byName = (a: Tag, b: Tag) => a.name.localeCompare(b.name)

export const useTagStore = create<TagState>((set, get) => {
  let generation = 0
  let fetchRequest = 0
  let pending = 0
  type Mutation = {
    data: Partial<Pick<Tag, 'name' | 'color'>> | null
    settled: boolean
    failed: boolean
    result?: Tag
  }
  const mutations = new Map<string, { base: Tag | undefined; entries: Mutation[] }>()
  const mutate = async (
    id: string,
    data: Partial<Pick<Tag, 'name' | 'color'>> | null,
    request: () => Promise<Tag | void>
  ) => {
    const journal = mutations.get(id) ?? { base: get().tags.find((t) => t.id === id), entries: [] }
    const mutation: Mutation = { data, settled: false, failed: false }
    journal.entries.push(mutation)
    mutations.set(id, journal)
    generation++
    pending++
    const publish = () => {
      let tag = journal.base
      for (const entry of journal.entries) {
        if (entry.failed) continue
        tag = entry.settled
          ? entry.result
          : entry.data === null
            ? undefined
            : tag
              ? { ...tag, ...entry.data }
              : undefined
      }
      set((state) => ({
        tags: [...state.tags.filter((t) => t.id !== id), ...(tag ? [tag] : [])].sort(byName),
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
    tags: [],
    isLoading: false,
    error: null,
    fetch: async () => {
      const request = ++fetchRequest
      const started = generation
      const canPublish = pending === 0
      set({ isLoading: true, error: null })
      try {
        const tags = await invoke('list_tags')
        if (request === fetchRequest && started === generation && canPublish) set({ tags })
      } catch (error) {
        if (request === fetchRequest) set({ error: String(error) })
      } finally {
        if (request === fetchRequest) set({ isLoading: false })
      }
    },
    add: async (tag) => {
      generation++
      pending++
      try {
        const created = await invoke('create_tag', { data: tag })
        set((state) => ({
          tags: [...state.tags.filter((t) => t.id !== created.id), created].sort(byName),
        }))
        return created
      } catch (error) {
        set({ error: String(error) })
        throw error
      } finally {
        pending--
        generation++
      }
    },
    update: (id, data) => mutate(id, data, () => invoke('update_tag', { id, data })),
    remove: (id) => mutate(id, null, () => invoke('delete_tag', { id })),
    addToSubscription: async (subscriptionId, tagId) => {
      try {
        await invoke('add_subscription_tag', { subscriptionId, tagId })
      } catch (error) {
        set({ error: String(error) })
        throw error
      }
    },
    removeFromSubscription: async (subscriptionId, tagId) => {
      try {
        await invoke('remove_subscription_tag', { subscriptionId, tagId })
      } catch (error) {
        set({ error: String(error) })
        throw error
      }
    },
    fetchForSubscription: async (subscriptionId) => {
      try {
        return await invoke('list_subscription_tags', { subscriptionId })
      } catch (error) {
        set({ error: String(error) })
        throw error
      }
    },
    fetchForSubscriptions: async (subscriptionIds) => {
      const uniqueSubscriptionIds = [...new Set(subscriptionIds)]
      if (uniqueSubscriptionIds.length === 0) return {}
      try {
        const links = await invoke('list_subscription_tags_batch', {
          subscriptionIds: uniqueSubscriptionIds,
        })
        const map: Record<string, string[]> = Object.fromEntries(
          uniqueSubscriptionIds.map((id) => [id, []])
        )
        for (const { subscription_id, tag_id } of links) (map[subscription_id] ??= []).push(tag_id)
        return map
      } catch (error) {
        set({ error: String(error) })
        return {}
      }
    },
  }
})
