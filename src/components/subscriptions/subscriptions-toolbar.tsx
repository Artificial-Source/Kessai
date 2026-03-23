import React from 'react'
import { Search, ArrowUpDown, LayoutGrid, List, Grid3x3 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CostNormalizationToggle } from '@/components/subscriptions/cost-normalization-toggle'
import { CategoryFilter } from '@/components/subscriptions/category-filter'
import { TagFilter } from '@/components/tags/tag-filter'
import type { Category } from '@/types/category'

export type SortOption =
  | 'name-asc'
  | 'name-desc'
  | 'price-asc'
  | 'price-desc'
  | 'date-asc'
  | 'date-desc'
  | 'category'

export const SORT_LABELS: Record<SortOption, string> = {
  'name-asc': 'Name (A-Z)',
  'name-desc': 'Name (Z-A)',
  'price-asc': 'Price (Low-High)',
  'price-desc': 'Price (High-Low)',
  'date-asc': 'Next billing (Soonest)',
  'date-desc': 'Next billing (Latest)',
  category: 'Category',
}

type ViewMode = 'grid' | 'list' | 'bento'

interface SubscriptionsToolbarProps {
  searchQuery: string
  setSearchQuery: (query: string) => void
  sortOption: SortOption
  setSortOption: (option: SortOption) => void
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  categories: Category[]
  selectedCategories: string[]
  setSelectedCategories: (ids: string[]) => void
  selectedTags: string[]
  setSelectedTags: (ids: string[]) => void
  subscriptionCounts: Record<string, number>
  subscriptionTagMap: Record<string, string[]>
}

export const SubscriptionsToolbar = React.memo(function SubscriptionsToolbar({
  searchQuery,
  setSearchQuery,
  sortOption,
  setSortOption,
  viewMode,
  setViewMode,
  categories,
  selectedCategories,
  setSelectedCategories,
  selectedTags,
  setSelectedTags,
  subscriptionCounts,
  subscriptionTagMap,
}: SubscriptionsToolbarProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-[280px]">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search subscriptions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search subscriptions"
              className="border-border bg-input text-foreground placeholder-muted-foreground focus:border-primary focus:ring-primary h-10 w-full rounded-lg border pr-4 pl-10 font-[family-name:var(--font-sans)] text-sm focus:ring-1 focus:outline-none"
            />
          </div>
          <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
            <SelectTrigger className="h-10 w-full gap-2 rounded-lg font-[family-name:var(--font-mono)] text-[11px] tracking-wider sm:w-[200px]" aria-label="Sort subscriptions">
              <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([value, label]) => (
                <SelectItem
                  key={value}
                  value={value}
                  className="font-[family-name:var(--font-mono)] text-[11px] tracking-wider"
                >
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <CostNormalizationToggle />
        </div>
        <div
          className="border-border flex rounded-lg border bg-[var(--color-surface-elevated)] p-1"
          role="group"
          aria-label="View mode"
        >
          <button
            onClick={() => setViewMode('grid')}
            aria-pressed={viewMode === 'grid'}
            className={`flex h-7 w-8 items-center justify-center rounded-md ${
              viewMode === 'grid'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            aria-pressed={viewMode === 'list'}
            className={`flex h-7 w-8 items-center justify-center rounded-md ${
              viewMode === 'list'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setViewMode('bento')}
            aria-pressed={viewMode === 'bento'}
            className={`flex h-7 w-8 items-center justify-center rounded-md ${
              viewMode === 'bento'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label="Bento view"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <CategoryFilter
        categories={categories}
        selectedIds={selectedCategories}
        onChange={setSelectedCategories}
        subscriptionCounts={subscriptionCounts}
      />
      <TagFilter
        selectedTagIds={selectedTags}
        onChange={setSelectedTags}
        subscriptionTagMap={subscriptionTagMap}
      />
    </div>
  )
})
