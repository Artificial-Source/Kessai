import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Input, fieldClassName } from '@/components/ui/input'
import { getCurrencyOptions, type CurrencyCode } from '@/lib/currency'
import { cn } from '@/lib/utils'

interface CurrencySelectProps {
  value: string
  onValueChange: (value: CurrencyCode) => void
  id?: string
  placeholder?: string
  triggerClassName?: string
  className?: string
}

export function CurrencySelect({
  value,
  onValueChange,
  id,
  placeholder = 'Select currency',
  triggerClassName,
  className,
}: CurrencySelectProps) {
  const generatedId = useId()
  const listboxId = `${id ?? generatedId}-listbox`
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const options = useMemo(() => getCurrencyOptions(), [])
  const selected = options.find((option) => option.value === value)
  const selectedLabel = selected?.label ?? (value ? value.toUpperCase() : placeholder)
  const normalizedQuery = query.trim().toLowerCase()
  const filteredOptions = useMemo(() => {
    if (!normalizedQuery) return options
    return options.filter((option) => option.searchText.includes(normalizedQuery))
  }, [normalizedQuery, options])

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    searchRef.current?.focus()

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        id={id}
        type="button"
        className={cn(
          fieldClassName,
          'flex h-10 items-center justify-between gap-2 px-3 py-2 text-left text-sm',
          triggerClassName
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selectedLabel}
        </span>
        <ChevronDown className="text-muted-foreground h-4 w-4 shrink-0" aria-hidden="true" />
      </button>

      {open ? (
        <div className="bg-popover text-popover-foreground border-border-hover absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-[0_12px_32px_-12px_rgba(0,0,0,0.5)]">
          <div className="border-border relative border-b p-2">
            <Search
              className="text-muted-foreground absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search currency"
              aria-label="Search currency"
              aria-controls={listboxId}
              className="h-9 pl-8"
              onKeyDown={(event) => event.stopPropagation()}
            />
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Currencies"
            className="max-h-72 overflow-y-auto p-1"
          >
            {filteredOptions.length === 0 ? (
              <p className="text-muted-foreground px-3 py-3 text-sm">No currencies found</p>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={cn(
                      'hover:bg-accent-muted focus-visible:bg-accent-muted flex min-h-9 w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-sm focus-visible:outline-offset-[-2px]',
                      isSelected && 'bg-accent-muted font-medium'
                    )}
                    onClick={() => {
                      onValueChange(option.value)
                      setOpen(false)
                      setQuery('')
                    }}
                  >
                    <span className="font-[family-name:var(--font-mono)] text-xs font-bold">
                      {option.value}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{option.name}</span>
                    <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-xs">
                      {option.symbol}
                    </span>
                    {isSelected ? (
                      <Check className="text-foreground h-4 w-4 shrink-0" aria-hidden="true" />
                    ) : null}
                  </button>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
