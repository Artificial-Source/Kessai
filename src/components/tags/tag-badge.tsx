import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Tag } from '@/types/tag'

interface TagBadgeProps {
  tag: Tag
  onRemove?: () => void
  className?: string
}

export function TagBadge({ tag, onRemove, className }: TagBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-none border px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-wider uppercase transition-colors',
        className
      )}
      style={{
        borderColor: `${tag.color}40`,
        backgroundColor: `${tag.color}15`,
        color: tag.color,
      }}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-0.5 rounded-sm opacity-70 hover:opacity-100"
          aria-label={`Remove tag ${tag.name}`}
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </span>
  )
}
