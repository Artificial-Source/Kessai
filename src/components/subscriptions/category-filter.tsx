import { memo, useId } from 'react'
import { Button } from '@/components/ui/button'
import type { Category } from '@/types/category'

interface CategoryFilterProps {
  categories: Category[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  subscriptionCounts: Record<string, number>
  /** Visible group label ("Categories") where the chips sit beside other filter groups. */
  label?: string
}

export const CategoryFilter = memo(function CategoryFilter({
  categories,
  selectedIds,
  onChange,
  subscriptionCounts,
  label,
}: CategoryFilterProps) {
  const labelId = useId()

  const handleToggle = (categoryId: string) => {
    if (selectedIds.includes(categoryId)) {
      onChange(selectedIds.filter((id) => id !== categoryId))
    } else {
      onChange([...selectedIds, categoryId])
    }
  }

  // Only show categories that have subscriptions
  const categoriesWithSubs = categories.filter((cat) => (subscriptionCounts[cat.id] || 0) > 0)

  if (categoriesWithSubs.length === 0) {
    return null
  }

  const chips = (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label={label ? undefined : 'Filter by category'}
      aria-labelledby={label ? labelId : undefined}
    >
      <Button
        variant="outline"
        size="sm"
        aria-pressed={selectedIds.length === 0}
        onClick={() => onChange([])}
      >
        All categories
      </Button>

      {categoriesWithSubs.map((category) => (
        <Button
          key={category.id}
          variant="outline"
          size="sm"
          aria-pressed={selectedIds.includes(category.id)}
          onClick={() => handleToggle(category.id)}
          className="max-w-full"
        >
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="truncate">{category.name}</span>
          <span className="font-[family-name:var(--font-mono)] tabular-nums opacity-70">
            {subscriptionCounts[category.id] || 0}
          </span>
        </Button>
      ))}
    </div>
  )

  if (!label) return chips

  return (
    <div className="flex flex-col gap-2">
      <p id={labelId} className="type-label text-muted-foreground">
        {label}
      </p>
      {chips}
    </div>
  )
})
