import { useState, useEffect, useId, useRef } from 'react'
import { Plus, Check } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useTagStore } from '@/stores/tag-store'
import { Button } from '@/components/ui/button'
import { ColorSwatches } from '@/components/ui/color-swatches'
import { FieldHint } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TAG_COLORS } from '@/types/tag'

interface TagPickerProps {
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
  const labelId = useId()
  const hintId = useId()
  const nameId = useId()
  const nameRef = useRef<HTMLInputElement>(null)

  // Opening the inline form is a request to type a name.
  useEffect(() => {
    if (showCreate) nameRef.current?.focus()
  }, [showCreate])

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

  const closeCreate = () => {
    setShowCreate(false)
    setNewTagName('')
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return

    setIsCreating(true)
    try {
      const created = await add({ name, color: newTagColor })
      onChange([...selectedTagIds, created.id])
      closeCreate()
      toast.success('Tag created', { description: `"${name}" has been added.` })
    } catch (error) {
      toast.error('Failed to create tag', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={tags.length === 0 ? hintId : undefined}
      className="flex flex-col gap-2"
    >
      <span id={labelId} className="text-sm leading-none font-medium">
        Tags
      </span>

      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => {
          const isSelected = selectedTagIds.includes(tag.id)
          return (
            <Button
              key={tag.id}
              variant="outline"
              size="sm"
              aria-pressed={isSelected}
              onClick={() => handleToggle(tag.id)}
            >
              {isSelected ? (
                <Check aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
              )}
              {tag.name}
            </Button>
          )
        })}
        {!showCreate && (
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)}>
            <Plus aria-hidden="true" />
            New tag
          </Button>
        )}
      </div>

      {tags.length === 0 && !showCreate && (
        <FieldHint id={hintId}>
          Tags group subscriptions across categories, like &ldquo;work&rdquo; or
          &ldquo;family&rdquo;.
        </FieldHint>
      )}

      {showCreate && (
        <div className="border-border flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>New tag name</Label>
            <Input
              id={nameId}
              ref={nameRef}
              placeholder="e.g. work"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              maxLength={30}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleCreateTag()
                }
              }}
            />
          </div>
          <ColorSwatches
            label="Tag color"
            colors={TAG_COLORS}
            value={newTagColor}
            onChange={setNewTagColor}
            size="sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeCreate}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!newTagName.trim() || isCreating}
              aria-busy={isCreating || undefined}
              onClick={handleCreateTag}
            >
              {isCreating ? (
                <span
                  aria-hidden="true"
                  className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                />
              ) : null}
              Create tag
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
