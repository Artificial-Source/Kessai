import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, RotateCw, Trash2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { SettingsListSkeleton, SettingsSection } from '@/components/settings/settings-section'
import { CategoryDialog } from './category-dialog'
import { CategoryIconDisplay } from './icon-picker'
import { useCategories } from '@/hooks/use-categories'
import type { Category } from '@/types/category'

export function CategoryManager() {
  const { categories, defaultCategories, customCategories, remove, isLoading, error, refresh } =
    useCategories()

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
        description: `${deleteTarget.name} is gone; its subscriptions are now uncategorized.`,
      })
    } catch (deleteError) {
      toast.error(`Couldn't delete ${deleteTarget.name}`, {
        description: deleteError instanceof Error ? deleteError.message : 'Nothing changed.',
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

  const content =
    categories.length > 0 ? (
      <div className="flex flex-col gap-5">
        {customCategories.length > 0 ? (
          <CategoryGroup
            label="Custom"
            categories={customCategories}
            onEdit={handleEdit}
            onDelete={setDeleteTarget}
          />
        ) : null}
        {/* Built-in categories ship with Kessai and can't be changed; the group says so once
            instead of offering a Delete that always fails. */}
        <CategoryGroup
          label="Built-in"
          description="These come with Kessai and can't be edited or deleted."
          categories={defaultCategories}
        />
      </div>
    ) : error ? (
      <EmptyState
        icon={TriangleAlert}
        tone="danger"
        variant="plain"
        size="compact"
        headingLevel="h3"
        title="Couldn't load categories"
        description="Your categories are safe; they just didn't load."
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <RotateCw aria-hidden="true" />
            Retry
          </Button>
        }
      />
    ) : (
      <SettingsListSkeleton label="Loading categories" rows={isLoading ? 4 : 2} />
    )

  return (
    <>
      <SettingsSection
        id="categories"
        title="Categories"
        description="Group subscriptions by what they're for."
        action={
          <Button size="sm" onClick={handleAdd}>
            <Plus aria-hidden="true" />
            Add category
          </Button>
        }
      >
        {content}
      </SettingsSection>

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        category={editingCategory}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name ?? 'category'}?`}
        description="Subscriptions in this category become uncategorized. This can't be undone."
        confirmLabel="Delete category"
        variant="destructive"
        isLoading={isDeleting}
        onConfirm={handleDelete}
      />
    </>
  )
}

function CategoryGroup({
  label,
  description,
  categories,
  onEdit,
  onDelete,
}: {
  label: string
  description?: string
  categories: Category[]
  /** Omitted for built-in categories, which can't be changed. */
  onEdit?: (category: Category) => void
  onDelete?: (category: Category) => void
}) {
  const labelId = useId()
  const descriptionId = useId()
  return (
    <div className="flex flex-col gap-1">
      <h3 id={labelId} className="type-label text-muted-foreground font-normal">
        {label}
      </h3>
      {description ? (
        <p id={descriptionId} className="text-muted-foreground text-xs">
          {description}
        </p>
      ) : null}
      <ul
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        className="divide-border flex flex-col divide-y"
      >
        {categories.map((category) => (
          <li key={category.id} className="flex items-center gap-3 py-2">
            <span
              aria-hidden="true"
              className="border-border-hover flex size-8 shrink-0 items-center justify-center rounded-md border"
              style={{ backgroundColor: category.color }}
            >
              <CategoryIconDisplay
                icon={category.icon}
                className="size-4 text-[color:var(--color-swatch-foreground)]"
              />
            </span>
            <span className="text-foreground min-w-0 flex-1 truncate text-sm font-medium">
              {category.name}
            </span>
            {onEdit || onDelete ? (
              <div className="flex shrink-0 items-center gap-1">
                {onEdit ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onEdit(category)}
                    aria-label={`Edit ${category.name}`}
                  >
                    <Pencil aria-hidden="true" />
                  </Button>
                ) : null}
                {onDelete ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:bg-destructive/15 hover:text-destructive"
                    onClick={() => onDelete(category)}
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
