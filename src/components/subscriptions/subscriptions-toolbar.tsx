import React, { useId, useState } from 'react'
import { Search, ArrowUpDown, LayoutGrid, List, Grid3x3, SlidersHorizontal } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CostNormalizationToggle } from '@/components/subscriptions/cost-normalization-toggle'
import { CategoryFilter } from '@/components/subscriptions/category-filter'
import { TagFilter } from '@/components/tags/tag-filter'
import { SORT_LABELS } from '@/components/subscriptions/subscriptions-sort'
import type { SortOption } from '@/components/subscriptions/subscriptions-sort'
import type { Category } from '@/types/category'
import { cn } from '@/lib/utils'

export type ViewMode = 'grid' | 'list' | 'bento'

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof List }[] = [
  { mode: 'list', label: 'List', icon: List },
  { mode: 'grid', label: 'Grid', icon: LayoutGrid },
  { mode: 'bento', label: 'Bento', icon: Grid3x3 },
]

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
  /** Subscriptions left after search and filters, for the phone filter sheet's footer. */
  resultCount: number
}

function SortSelect({
  value,
  onChange,
  className,
}: {
  value: SortOption
  onChange: (option: SortOption) => void
  className?: string
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortOption)}>
      <SelectTrigger className={cn('justify-start', className)} aria-label="Sort subscriptions">
        <ArrowUpDown aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
        <SelectValue className="flex-1 text-left" />
      </SelectTrigger>
      <SelectContent>
        {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([option, label]) => (
          <SelectItem key={option} value={option}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Wide screens: search, sort, period, and view on one row, filter chips on the next.
 * Phones: search plus a "Filters" button; everything else moves into a dialog so results
 * start right under the toolbar.
 */
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
  resultCount,
}: SubscriptionsToolbarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const viewLabelId = useId()
  const activeFilterCount = selectedCategories.length + selectedTags.length

  const filters = (labelled: boolean) => (
    <>
      <CategoryFilter
        categories={categories}
        selectedIds={selectedCategories}
        onChange={setSelectedCategories}
        subscriptionCounts={subscriptionCounts}
        label={labelled ? 'Categories' : undefined}
      />
      <TagFilter
        selectedTagIds={selectedTags}
        onChange={setSelectedTags}
        subscriptionTagMap={subscriptionTagMap}
        label={labelled ? 'Tags' : undefined}
      />
    </>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 md:gap-3">
        <div className="relative min-w-0 flex-1 md:max-w-xs">
          <Search
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <Input
            type="search"
            placeholder="Search subscriptions"
            aria-label="Search subscriptions"
            aria-keyshortcuts="/"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button
          variant="outline"
          className="md:hidden"
          aria-haspopup="dialog"
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <Badge size="sm" aria-label={`${activeFilterCount} active`}>
              {activeFilterCount}
            </Badge>
          )}
        </Button>

        <div className="hidden items-center gap-3 md:flex">
          <SortSelect value={sortOption} onChange={setSortOption} className="w-48 lg:w-56" />
          <CostNormalizationToggle className="w-36 lg:w-44" />
        </div>

        <div
          role="group"
          aria-label="View mode"
          className="border-border ml-auto hidden gap-0.5 rounded-md border p-0.5 md:flex"
        >
          {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
            <Button
              key={mode}
              variant="ghost"
              size="icon-sm"
              aria-label={`${label} view`}
              aria-pressed={viewMode === mode}
              title={`${label} view`}
              onClick={() => setViewMode(mode)}
            >
              <Icon aria-hidden="true" />
            </Button>
          ))}
        </div>
      </div>

      <div className="hidden flex-col gap-2 md:flex">{filters(false)}</div>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Filters and view</DialogTitle>
            <DialogDescription>
              {resultCount} {resultCount === 1 ? 'subscription' : 'subscriptions'} shown
            </DialogDescription>
          </DialogHeader>

          <div className="-mx-6 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 pb-1">
            <div className="flex flex-col gap-2">
              <p className="type-label text-muted-foreground">Sort and costs</p>
              <SortSelect value={sortOption} onChange={setSortOption} />
              <CostNormalizationToggle />
            </div>

            <div className="flex flex-col gap-2">
              <p className="type-label text-muted-foreground" id={viewLabelId}>
                View
              </p>
              <div role="group" aria-labelledby={viewLabelId} className="flex gap-2">
                {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
                  <Button
                    key={mode}
                    variant="outline"
                    size="sm"
                    aria-label={`${label} view`}
                    aria-pressed={viewMode === mode}
                    onClick={() => setViewMode(mode)}
                    className="flex-1"
                  >
                    <Icon aria-hidden="true" />
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Phone: each chip group is named, so tags never read as more categories. */}
            {filters(true)}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              disabled={activeFilterCount === 0}
              onClick={() => {
                setSelectedCategories([])
                setSelectedTags([])
              }}
            >
              Clear filters
            </Button>
            <Button onClick={() => setFiltersOpen(false)}>
              Show {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
})
