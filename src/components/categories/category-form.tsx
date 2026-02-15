import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IconPicker } from './icon-picker'
import {
  categoryFormSchema,
  DEFAULT_CATEGORY_COLORS,
  type CategoryFormData,
  type Category,
} from '@/types/category'
import { cn } from '@/lib/utils'

type CategoryFormProps = {
  category?: Category | null
  onSubmit: (data: CategoryFormData) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
}

export function CategoryForm({
  category,
  onSubmit,
  onCancel,
  isLoading = false,
}: CategoryFormProps) {
  const isEditing = Boolean(category)

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: '',
      color: DEFAULT_CATEGORY_COLORS[0],
      icon: 'box',
    },
  })

  useEffect(() => {
    if (category) {
      form.reset({
        name: category.name,
        color: category.color,
        icon: category.icon,
      })
    }
  }, [category, form])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const isValid = await form.trigger()
    if (isValid) {
      await onSubmit(form.getValues())
    }
  }

  const selectedColor = form.watch('color')
  const selectedIcon = form.watch('icon')

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="Category name"
            className="bg-input"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-destructive text-sm">{form.formState.errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Color *</Label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => form.setValue('color', color)}
                className={cn(
                  'h-8 w-8 rounded-lg transition-all',
                  selectedColor === color
                    ? 'ring-primary ring-offset-background scale-110 ring-2 ring-offset-2'
                    : 'hover:scale-105'
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          {form.formState.errors.color && (
            <p className="text-destructive text-sm">{form.formState.errors.color.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Icon *</Label>
          <IconPicker value={selectedIcon} onChange={(icon) => form.setValue('icon', icon)} />
          {form.formState.errors.icon && (
            <p className="text-destructive text-sm">{form.formState.errors.icon.message}</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Saving...
            </span>
          ) : isEditing ? (
            'Update Category'
          ) : (
            'Add Category'
          )}
        </Button>
      </div>
    </form>
  )
}
