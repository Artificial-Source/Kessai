import { useState } from 'react'
import { toast } from 'sonner'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="mb-6">
          <SheetTitle className="text-xl">
            {isEditing ? 'Edit Category' : 'Add Category'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Update the details of your category below.'
              : 'Create a new category to organize your subscriptions.'}
          </SheetDescription>
        </SheetHeader>

        <CategoryForm
          category={category}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          isLoading={isLoading}
        />
      </SheetContent>
    </Sheet>
  )
}
