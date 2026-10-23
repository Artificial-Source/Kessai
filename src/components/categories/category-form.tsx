import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { IconPicker } from './icon-picker'
import {
  categoryFormSchema,
  DEFAULT_CATEGORY_COLORS,
  type CategoryFormData,
  type Category,
} from '@/types/category'
import { colorName } from '@/lib/constants'
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

  const selectedColor = form.watch('color')
  const selectedIcon = form.watch('icon')
  const { errors } = form.formState

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">Name</Label>
        <Input
          id="category-name"
          placeholder="e.g. Streaming"
          maxLength={50}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? 'category-name-error' : undefined}
          {...form.register('name')}
        />
        <FieldError id="category-name-error">{errors.name?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <span id="category-color-label" className="text-sm leading-none font-medium">
          Color
        </span>
        <div role="group" aria-labelledby="category-color-label" className="flex flex-wrap gap-1">
          {DEFAULT_CATEGORY_COLORS.map((color) => {
            const selected = selectedColor === color
            return (
              <button
                key={color}
                type="button"
                onClick={() => form.setValue('color', color, { shouldValidate: true })}
                aria-label={colorName(color)}
                aria-pressed={selected}
                className="flex size-9 items-center justify-center rounded-md pointer-coarse:size-11"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'size-6 rounded-sm transition-shadow duration-150',
                    selected && 'ring-foreground ring-offset-background ring-2 ring-offset-2'
                  )}
                  style={{ backgroundColor: color }}
                />
              </button>
            )
          })}
        </div>
        <FieldError>{errors.color?.message}</FieldError>
      </div>

      <div className="flex flex-col gap-2">
        <span id="category-icon-label" className="text-sm leading-none font-medium">
          Icon
        </span>
        <IconPicker
          labelledBy="category-icon-label"
          value={selectedIcon}
          onChange={(icon) => form.setValue('icon', icon, { shouldValidate: true })}
        />
        <FieldError>{errors.icon?.message}</FieldError>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading} aria-busy={isLoading}>
          {isLoading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          {isEditing ? 'Save changes' : 'Add category'}
        </Button>
      </DialogFooter>
    </form>
  )
}
