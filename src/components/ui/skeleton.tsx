import type * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * Placeholder block shaped like the content it stands in for. Decorative: wrap a group of
 * skeletons in an element with `role="status"` and an sr-only "Loading …" label.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-surface-highest/60 animate-pulse rounded-md', className)}
      {...props}
    />
  )
}
