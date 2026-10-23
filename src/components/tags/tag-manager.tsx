import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Tag as TagIcon,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTagStore } from '@/stores/tag-store'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SettingsListSkeleton, SettingsSection } from '@/components/settings/settings-section'
import { ColorSwatches } from '@/components/ui/color-swatches'
import { TAG_COLORS } from '@/types/tag'
import type { Tag } from '@/types/tag'

const NEW_TAG = 'new'

export function TagManager() {
  const { tags, isLoading, error, fetch, add, update, remove } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      isLoading: state.isLoading,
      error: state.error,
      fetch: state.fetch,
      add: state.add,
      update: state.update,
      remove: state.remove,
    }))
  )

  /** `new` while adding, a tag id while editing that tag, otherwise null. */
  const [editing, setEditing] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)

  useEffect(() => {
    void fetch().finally(() => setHasLoaded(true))
  }, [fetch])

  const handleSave = async (name: string, color: string) => {
    setIsSaving(true)
    try {
      if (editing === NEW_TAG) {
        await add({ name, color })
        toast.success(`Added tag ${name}`)
      } else if (editing) {
        await update(editing, { name, color })
        toast.success(`Saved tag ${name}`)
      }
      setEditing(null)
    } catch (saveError) {
      toast.error(`Couldn't save tag ${name}`, {
        description: saveError instanceof Error ? saveError.message : 'Try again.',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await remove(deleteTarget.id)
      toast.success(`Deleted tag ${deleteTarget.name}`)
    } catch (deleteError) {
      toast.error(`Couldn't delete tag ${deleteTarget.name}`, {
        description: deleteError instanceof Error ? deleteError.message : 'Nothing changed.',
      })
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const loading = tags.length === 0 && !error && (isLoading || !hasLoaded)
  const isEmpty = !loading && !error && tags.length === 0 && editing !== NEW_TAG
  const addForm =
    editing === NEW_TAG ? (
      <TagForm
        submitLabel="Add tag"
        busy={isSaving}
        onSubmit={handleSave}
        onCancel={() => setEditing(null)}
      />
    ) : null

  let content: React.ReactNode
  if (loading) {
    content = <SettingsListSkeleton label="Loading tags" />
  } else if (error && tags.length === 0) {
    content = (
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="Couldn't load tags"
        description="Your tags are safe; they just didn't load."
        action={
          <Button variant="outline" size="sm" onClick={() => void fetch()}>
            <RotateCw aria-hidden="true" />
            Retry
          </Button>
        }
      />
    )
  } else if (isEmpty) {
    content = (
      <EmptyState
        icon={TagIcon}
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="No tags yet"
        description="Tags label subscriptions across categories, like work or shared."
        action={
          <Button variant="outline" size="sm" onClick={() => setEditing(NEW_TAG)}>
            <Plus aria-hidden="true" />
            Add tag
          </Button>
        }
      />
    )
  } else {
    content = (
      <ul className="divide-border flex flex-col divide-y">
        {addForm ? <li className="pb-4">{addForm}</li> : null}
        {tags.map((tag) =>
          editing === tag.id ? (
            <li key={tag.id} className="py-4">
              <TagForm
                initialName={tag.name}
                initialColor={tag.color}
                submitLabel="Save tag"
                busy={isSaving}
                onSubmit={handleSave}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={tag.id} className="flex items-center gap-3 py-2">
              <span
                aria-hidden="true"
                className="border-border-hover size-3 shrink-0 rounded-full border"
                style={{ backgroundColor: tag.color }}
              />
              <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
                {tag.name}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(tag.id)}
                  aria-label={`Edit ${tag.name}`}
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => setDeleteTarget(tag)}
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </li>
          )
        )}
      </ul>
    )
  }

  return (
    <>
      <SettingsSection
        id="tags"
        title="Tags"
        description="Label subscriptions across categories and filter by them."
        action={
          isEmpty || loading ? null : (
            <Button size="sm" onClick={() => setEditing(NEW_TAG)} disabled={editing === NEW_TAG}>
              <Plus aria-hidden="true" />
              Add tag
            </Button>
          )
        }
      >
        {content}
      </SettingsSection>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete tag ${deleteTarget?.name ?? ''}?`}
        description="It comes off every subscription that has it. This can't be undone."
        confirmLabel="Delete tag"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

function TagForm({
  initialName = '',
  initialColor = TAG_COLORS[0],
  submitLabel,
  busy,
  onSubmit,
  onCancel,
}: {
  initialName?: string
  initialColor?: string
  submitLabel: string
  busy: boolean
  onSubmit: (name: string, color: string) => void | Promise<void>
  onCancel: () => void
}) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialName)
  const [color, setColor] = useState(initialColor)
  const [nameError, setNameError] = useState<string | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setNameError('Enter a tag name.')
      inputRef.current?.focus()
      return
    }
    void onSubmit(trimmed, color)
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onCancel()
        }
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-name`}>Tag name</Label>
        <Input
          ref={inputRef}
          id={`${id}-name`}
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setNameError(null)
          }}
          maxLength={30}
          placeholder="e.g. work"
          aria-invalid={Boolean(nameError)}
          aria-describedby={nameError ? `${id}-error` : undefined}
          className="sm:max-w-xs"
        />
        <FieldError id={`${id}-error`}>{nameError}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <span aria-hidden="true" className="text-sm leading-none font-medium">
          Color
        </span>
        <ColorSwatches
          label="Tag color"
          colors={TAG_COLORS}
          value={color}
          onChange={setColor}
          size="sm"
        />
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
