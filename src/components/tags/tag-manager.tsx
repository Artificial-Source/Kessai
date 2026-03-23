import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useTagStore } from '@/stores/tag-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TAG_COLORS } from '@/types/tag'
import type { Tag } from '@/types/tag'

export function TagManager() {
  const { tags, isLoading, fetch, add, update, remove } = useTagStore(
    useShallow((state) => ({
      tags: state.tags,
      isLoading: state.isLoading,
      fetch: state.fetch,
      add: state.add,
      update: state.update,
      remove: state.remove,
    }))
  )

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0])
  const [isAdding, setIsAdding] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    fetch()
  }, [fetch])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) return

    setIsAdding(true)
    try {
      await add({ name, color: newColor })
      setNewName('')
      setNewColor(TAG_COLORS[0])
      setShowAddForm(false)
      toast.success('Tag created', { description: `"${name}" has been added.` })
    } catch (error) {
      toast.error('Failed to create tag', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setIsAdding(false)
    }
  }

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  const handleSaveEdit = async () => {
    if (!editingTag) return
    const name = editName.trim()
    if (!name) return

    try {
      await update(editingTag.id, { name, color: editColor })
      setEditingTag(null)
      toast.success('Tag updated')
    } catch (error) {
      toast.error('Failed to update tag', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await remove(deleteTarget.id)
      toast.success('Tag deleted', {
        description: `"${deleteTarget.name}" has been removed.`,
      })
    } catch {
      toast.error('Error', {
        description: 'Failed to delete tag. Please try again.',
      })
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-medium">Tags</h3>
            <p className="text-muted-foreground text-sm">
              Label your subscriptions with custom tags
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowAddForm(true)}
            className="gap-1"
            disabled={showAddForm}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {showAddForm && (
          <div className="border-border bg-muted/30 space-y-3 rounded-lg border p-3">
            <Input
              placeholder="Tag name..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="border-border bg-muted/50 h-8 text-sm"
              maxLength={30}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
                if (e.key === 'Escape') {
                  setShowAddForm(false)
                  setNewName('')
                }
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {TAG_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  aria-label={`Color ${color}`}
                  aria-pressed={newColor === color}
                  className="h-5 w-5 rounded-full"
                  style={{
                    backgroundColor: color,
                    outline: newColor === color ? `2px solid ${color}` : 'none',
                    outlineOffset: '2px',
                  }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setShowAddForm(false)
                  setNewName('')
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newName.trim() || isAdding}
                onClick={handleAdd}
              >
                {isAdding ? 'Creating...' : 'Create Tag'}
              </Button>
            </div>
          </div>
        )}

        {tags.length === 0 && !showAddForm ? (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No tags yet. Create one to start labelling your subscriptions.
          </p>
        ) : (
          <div className="space-y-1">
            {tags.map((tag) =>
              editingTag?.id === tag.id ? (
                <div
                  key={tag.id}
                  className="bg-muted/70 flex items-center gap-2 rounded-lg px-3 py-2"
                >
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="border-border bg-muted/50 h-7 flex-1 text-sm"
                    maxLength={30}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleSaveEdit()
                      }
                      if (e.key === 'Escape') setEditingTag(null)
                    }}
                  />
                  <div className="flex gap-1">
                    {TAG_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setEditColor(color)}
                        className="h-4 w-4 rounded-full"
                        style={{
                          backgroundColor: color,
                          outline: editColor === color ? `2px solid ${color}` : 'none',
                          outlineOffset: '1px',
                        }}
                      />
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleSaveEdit}
                    aria-label="Save"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setEditingTag(null)}
                    aria-label="Cancel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <div
                  key={tag.id}
                  className="bg-muted/70 flex items-center justify-between rounded-lg px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span className="text-foreground font-medium">{tag.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleStartEdit(tag)}
                      aria-label={`Edit ${tag.name}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:bg-destructive/15 hover:text-destructive h-7 w-7"
                      onClick={() => setDeleteTarget(tag)}
                      aria-label={`Delete ${tag.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Tag"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? It will be removed from all subscriptions.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}
