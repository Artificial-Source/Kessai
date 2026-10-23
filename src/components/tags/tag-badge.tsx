import { Badge } from '@/components/ui/badge'
import type { Tag } from '@/types/tag'

interface TagBadgeProps {
  tag: Tag
  className?: string
}

/** A tag as data: its color is the dot, the name stays in ink. */
export function TagBadge({ tag, className }: TagBadgeProps) {
  return (
    <Badge variant="outline" size="sm" dot dotColor={tag.color} className={className}>
      {tag.name}
    </Badge>
  )
}
