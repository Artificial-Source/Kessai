import { useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CategoryForm } from './category-form'
import { useCategoryStore } from '@/stores/category-store'
import type { CategoryFormData, Category } from '@/types/category'

type CategoryDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: Category | null
}

export function CategoryDialog({ open, onOpenChange, category }: CategoryDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { add, update } = useCategoryStore()

  const isEditing = Boolean(category)

  const handleSubmit = async (data: CategoryFormData) => {
    setIsLoading(true)
    try {
      if (isEditing && category) {
        await update(category.id, {
          name: data.name,
          color: data.color,
          icon: data.icon,
        })
        toast.success('Category updated', {
          description: `${data.name} has been updated successfully.`,
        })
      } else {
        await add({
          name: data.name,
          color: data.color,
          icon: data.icon,
        })
        toast.success('Category added', {
          description: `${data.name} has been added to your categories.`,
        })
      }
      onOpenChange(false)
    } catch (error) {
      toast.error('Error', {
        description: `Failed to ${isEditing ? 'update' : 'add'} category. Please try again.`,
      })
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {isEditing ? 'Edit Category' : 'Add Category'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the details of your category below.'
              : 'Create a new category to organize your subscriptions.'}
          </DialogDescription>
        </DialogHeader>

        <CategoryForm
          category={category}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={isLoading}
        />
      </DialogContent>
    </Dialog>
  )
}
