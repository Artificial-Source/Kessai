import { memo, useEffect, useId } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useTagStore } from '@/stores/tag-store'
import { Button } from '@/components/ui/button'

interface TagFilterProps {
  selectedTagIds: string[]
  onChange: (ids: string[]) => void
  subscriptionTagMap: Record<string, string[]>
  /** Visible group label ("Tags") where the chips sit beside other filter groups. */
  label?: string
}

export const TagFilter = memo(function TagFilter({
  selectedTagIds,
  onChange,
  subscriptionTagMap,
  label,
}: TagFilterProps) {
  const { tags, fetch } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      fetch: state.fetch,
    }))
  )
  const labelId = useId()

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

  const chips = (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={label ? undefined : 'Filter by tag'}
      aria-labelledby={label ? labelId : undefined}
    >
      {tagsWithSubs.map((tag) => (
        <Button
          key={tag.id}
          variant="outline"
          size="sm"
          aria-pressed={selectedTagIds.includes(tag.id)}
          onClick={() => handleToggle(tag.id)}
          className="max-w-full"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: tag.color }}
          />
          <span className="truncate">{tag.name}</span>
          <span className="font-[family-name:var(--font-mono)] tabular-nums opacity-70">
            {tagCounts[tag.id] || 0}
          </span>
        </Button>
      ))}
    </div>
  )

  if (!label) return chips

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="type-label text-muted-foreground">
        {label}
      </p>
      {chips}
    </div>
  )
})
