import { useState, useMemo, memo } from 'react'
import { Search, FileText } from 'lucide-react'
import { SUBSCRIPTION_TEMPLATES, TEMPLATE_CATEGORIES } from '@/data/subscription-templates'
import { TemplateCard } from './template-card'
import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import type { SubscriptionTemplate } from '@/data/subscription-templates'

interface TemplatePickerProps {
  onSelect: (template: SubscriptionTemplate) => void
  onStartFromScratch: () => void
}

export const TemplatePicker = memo(function TemplatePicker({
  onSelect,
  onStartFromScratch,
}: TemplatePickerProps) {
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const query = search.toLowerCase().trim()
    return SUBSCRIPTION_TEMPLATES.filter((t) => {
      const matchesCategory = !selectedCategory || t.category === selectedCategory
      if (!query) return matchesCategory
      const matchesSearch =
        t.name.toLowerCase().includes(query) ||
        t.keywords.some((k) => k.includes(query)) ||
        t.category.toLowerCase().includes(query)
      return matchesCategory && matchesSearch
    })
  }, [search, selectedCategory])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="relative shrink-0">
        <Search
          aria-hidden="true"
          className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          placeholder="Search services"
          aria-label="Search services"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Phones: one snap-scrolling row, so categories never push the list below the fold.
          From sm the chips wrap: every category stays visible without a hidden scroll. */}
      <div
        role="group"
        aria-label="Filter by category"
        className="-mx-6 flex shrink-0 snap-x scroll-px-6 gap-2 overflow-x-auto px-6 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
      >
        <Button
          variant="outline"
          size="sm"
          aria-pressed={!selectedCategory}
          onClick={() => setSelectedCategory(null)}
          className="snap-start"
        >
          All
        </Button>
        {TEMPLATE_CATEGORIES.map((cat) => (
          <Button
            key={cat}
            variant="outline"
            size="sm"
            aria-pressed={selectedCategory === cat}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            className="snap-start"
          >
            {cat}
          </Button>
        ))}
      </div>

      <div className="-mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 sm:max-h-[50vh]">
        {filtered.length > 0 ? (
          <ul className="grid grid-cols-1 gap-2 pb-1 sm:grid-cols-2">
            {filtered.map((template) => (
              <li key={template.id} className="flex">
                <TemplateCard template={template} onClick={() => onSelect(template)} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Search}
            variant="plain"
            size="compact"
            headingLevel="h3"
            title="No matching services"
            description="Not every service has a template. Add it with your own details."
            action={
              <Button variant="outline" onClick={onStartFromScratch}>
                <FileText aria-hidden="true" />
                Start from scratch
              </Button>
            }
          />
        )}
      </div>

      {filtered.length > 0 && (
        <div className="border-border -mx-6 border-t px-6 pt-4">
          <DialogFooter className="pt-0">
            <Button variant="outline" onClick={onStartFromScratch}>
              <FileText aria-hidden="true" />
              Start from scratch
            </Button>
          </DialogFooter>
        </div>
      )}
    </div>
  )
})
