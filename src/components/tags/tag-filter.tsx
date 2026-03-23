import { memo, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTagStore } from '@/stores/tag-store'

interface TagFilterProps {
  selectedTagIds: string[]
  onChange: (ids: string[]) => void
  subscriptionTagMap: Record<string, string[]>
}

export const TagFilter = memo(function TagFilter({
  selectedTagIds,
  onChange,
  subscriptionTagMap,
}: TagFilterProps) {
  const { tags, fetch } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      fetch: state.fetch,
    }))
  )

  useEffect(() => {
    if (tags.length === 0) {
      fetch()
    }
  }, [tags.length, fetch])

  // Count how many subscriptions use each tag
  const tagCounts: Record<string, number> = {}
  for (const tagIds of Object.values(subscriptionTagMap)) {
    for (const tagId of tagIds) {
      tagCounts[tagId] = (tagCounts[tagId] || 0) + 1
    }
  }

  // Only show tags that have subscriptions
  const tagsWithSubs = tags.filter((tag) => (tagCounts[tag.id] || 0) > 0)

  if (tagsWithSubs.length === 0) {
    return null
  }

  const handleToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tagsWithSubs.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id)
        const count = tagCounts[tag.id] || 0

        return (
          <button
            key={tag.id}
            onClick={() => handleToggle(tag.id)}
            aria-pressed={isSelected}
            className="flex items-center gap-2 rounded-none border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase transition-colors"
            style={{
              borderColor: isSelected ? tag.color : 'var(--color-border)',
              backgroundColor: isSelected ? `${tag.color}20` : 'transparent',
              color: isSelected ? tag.color : 'var(--color-muted-foreground)',
            }}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag.color }} />
            <span className="truncate" title={tag.name}>
              {tag.name}
            </span>
            <span className="text-[10px] opacity-70">{count}</span>
          </button>
        )
      })}
    </div>
  )
})
