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
        toast.success(`Saved ${data.name}`)
      } else {
        await add({
          name: data.name,
          color: data.color,
          icon: data.icon,
        })
        toast.success(`Added ${data.name}`)
      }
      onOpenChange(false)
    } catch (error) {
      toast.error(`Couldn't ${isEditing ? 'save' : 'add'} ${data.name}`, {
        description: error instanceof Error ? error.message : 'Try again.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit category' : 'Add category'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Rename it or change how it looks. Its subscriptions stay assigned.'
              : 'Name it and pick a color and icon to recognize it by.'}
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
