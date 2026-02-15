import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CategoryDialog } from './category-dialog'
import { CategoryIconDisplay } from './icon-picker'
import { useCategories } from '@/hooks/use-categories'
import type { Category } from '@/types/category'

export function CategoryManager() {
  const { categories, remove, isLoading } = useCategories()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleEdit = (category: Category) => {
    setEditingCategory(category)
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingCategory(null)
    setDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await remove(deleteTarget.id)
      toast.success('Category deleted', {
        description: `${deleteTarget.name} has been removed. Associated subscriptions are now uncategorized.`,
      })
    } catch {
      toast.error('Error', {
        description: 'Failed to delete category. Please try again.',
      })
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }

  const handleDialogClose = (open: boolean) => {
    if (!open) {
      setDialogOpen(false)
      setEditingCategory(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="border-primary h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
      </div>
    )
  }

  const defaultCategories = categories.filter((c) => c.is_default)
  const customCategories = categories.filter((c) => !c.is_default)

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-foreground font-medium">Categories</h3>
            <p className="text-muted-foreground text-sm">
              Organize your subscriptions with categories
            </p>
          </div>
          <Button size="sm" onClick={handleAdd} className="gap-1">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>

        {customCategories.length > 0 && (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Custom
            </p>
            <div className="space-y-1">
              {customCategories.map((category) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  onEdit={() => handleEdit(category)}
                  onDelete={() => setDeleteTarget(category)}
                />
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            Default
          </p>
          <div className="space-y-1">
            {defaultCategories.map((category) => (
              <CategoryItem
                key={category.id}
                category={category}
                onDelete={() => setDeleteTarget(category)}
              />
            ))}
          </div>
        </div>
      </div>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        category={editingCategory}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Category"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? Subscriptions using this category will become uncategorized.`}
        confirmLabel="Delete"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

type CategoryItemProps = {
  category: Category
  onEdit?: () => void
  onDelete?: () => void
}

function CategoryItem({ category, onEdit, onDelete }: CategoryItemProps) {
  return (
    <div className="bg-muted/70 flex items-center justify-between rounded-lg px-3 py-2">
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg"
          style={{ backgroundColor: category.color }}
        >
          <CategoryIconDisplay icon={category.icon} className="h-4 w-4 text-white" />
        </div>
        <span className="text-foreground font-medium">{category.name}</span>
      </div>
      <div className="flex gap-1">
        {onEdit && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/15 hover:text-destructive h-7 w-7"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
