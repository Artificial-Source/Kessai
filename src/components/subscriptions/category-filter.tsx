import { memo } from 'react'
import type { Category } from '@/types/category'

interface CategoryFilterProps {
  categories: Category[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  subscriptionCounts: Record<string, number>
}

export const CategoryFilter = memo(function CategoryFilter({
  categories,
  selectedIds,
  onChange,
  subscriptionCounts,
}: CategoryFilterProps) {
  const handleToggle = (categoryId: string) => {
    if (selectedIds.includes(categoryId)) {
      onChange(selectedIds.filter((id) => id !== categoryId))
    } else {
      onChange([...selectedIds, categoryId])
    }
  }

  const handleClearAll = () => {
    onChange([])
  }

  // Only show categories that have subscriptions
  const categoriesWithSubs = categories.filter((cat) => (subscriptionCounts[cat.id] || 0) > 0)

  if (categoriesWithSubs.length === 0) {
    return null
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* All button */}
      <button
        onClick={handleClearAll}
        aria-pressed={selectedIds.length === 0}
        className={`rounded-full border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase transition-colors ${
          selectedIds.length === 0
            ? 'bg-primary text-primary-foreground border-primary'
            : 'text-muted-foreground border-border hover:border-border-hover hover:text-foreground bg-transparent'
        }`}
      >
        All
      </button>

      {/* Category chips */}
      {categoriesWithSubs.map((category) => {
        const isSelected = selectedIds.includes(category.id)
        const count = subscriptionCounts[category.id] || 0

        return (
          <button
            key={category.id}
            onClick={() => handleToggle(category.id)}
            aria-pressed={isSelected}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 font-[family-name:var(--font-mono)] text-[11px] tracking-wider uppercase transition-colors ${
              isSelected
                ? 'bg-primary text-primary-foreground border-primary'
                : 'text-muted-foreground border-border hover:border-border-hover hover:text-foreground bg-transparent'
            }`}
          >
            {/* Color dot */}
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: category.color }} />
            <span className="truncate" title={category.name}>
              {category.name}
            </span>
            <span
              className={`text-[10px] ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
})
