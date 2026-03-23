import { useState, useEffect } from 'react'
import { Plus, Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useTagStore } from '@/stores/tag-store'
import { TagBadge } from './tag-badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TAG_COLORS } from '@/types/tag'
import type { Tag } from '@/types/tag'

interface TagPickerProps {
  subscriptionId?: string | null
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}

export function TagPicker({ selectedTagIds, onChange }: TagPickerProps) {
  const { tags, fetch, add } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      fetch: state.fetch,
      add: state.add,
    }))
  )

  const [showCreate, setShowCreate] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState<string>(TAG_COLORS[0])
  const [isCreating, setIsCreating] = useState(false)

  useEffect(() => {
    if (tags.length === 0) {
      fetch()
    }
  }, [tags.length, fetch])

  const handleToggle = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return

    setIsCreating(true)
    try {
      const created = await add({ name, color: newTagColor })
      onChange([...selectedTagIds, created.id])
      setNewTagName('')
      setShowCreate(false)
      toast.success('Tag created', { description: `"${name}" has been added.` })
    } catch (error) {
      toast.error('Failed to create tag', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsCreating(false)
    }
  }

  const selectedTags = tags.filter((t) => selectedTagIds.includes(t.id))

  return (
    <div className="space-y-3">
      <Label>Tags</Label>

      {/* Selected tags */}
      {selectedTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selectedTags.map((tag) => (
            <TagBadge
              key={tag.id}
              tag={tag}
              onRemove={() => handleToggle(tag.id)}
            />
          ))}
        </div>
      )}

      {/* Tag checkboxes */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag: Tag) => {
            const isSelected = selectedTagIds.includes(tag.id)
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleToggle(tag.id)}
                className="flex items-center gap-1.5 rounded-none border px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase transition-colors"
                style={{
                  borderColor: isSelected ? tag.color : 'var(--color-border)',
                  backgroundColor: isSelected ? `${tag.color}15` : 'transparent',
                  color: isSelected ? tag.color : 'var(--color-muted-foreground)',
                }}
              >
                {isSelected ? (
                  <Check className="h-3 w-3" />
                ) : (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                )}
                {tag.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Create new tag inline */}
      {showCreate ? (
        <div className="border-border bg-muted/30 space-y-2 rounded-lg border p-3">
          <Input
            placeholder="Tag name..."
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            className="border-border bg-muted/50 h-8 text-sm"
            maxLength={30}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleCreateTag()
              }
            }}
          />
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewTagColor(color)}
                aria-label={`Color ${color}`}
                aria-pressed={newTagColor === color}
                className="h-5 w-5 rounded-full"
                style={{
                  backgroundColor: color,
                  outline: newTagColor === color ? `2px solid ${color}` : 'none',
                  outlineOffset: '2px',
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => {
                setShowCreate(false)
                setNewTagName('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs"
              disabled={!newTagName.trim() || isCreating}
              onClick={handleCreateTag}
            >
              {isCreating ? 'Creating...' : 'Create'}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase transition-colors"
        >
          <Plus className="h-3 w-3" />
          New tag
        </button>
      )}
    </div>
  )
}
