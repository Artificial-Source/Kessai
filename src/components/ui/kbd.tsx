import type * as React from 'react'
import { cn } from '@/lib/utils'

/** A single key cap. Combine several inside a flex row for chords (Ctrl + K). */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'border-border-hover bg-input text-muted-foreground inline-flex h-6 min-w-6 items-center justify-center rounded-sm border px-1.5 font-[family-name:var(--font-mono)] text-[11px] leading-none font-medium',
        className
      )}
      {...props}
    />
  )
}
