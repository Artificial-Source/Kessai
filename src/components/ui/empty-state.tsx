import type * as React from 'react'
import { cn } from '@/lib/utils'

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

interface EmptyStateProps {
  /** Lucide icon (or any icon component) that names the missing thing, not a mood. */
  icon?: IconComponent
  title: string
  /** One or two sentences: why it is empty and what filling it does. */
  description?: React.ReactNode
  /** Primary action first; at most one primary and one secondary button. */
  action?: React.ReactNode
  /** Extra content under the actions (e.g. collapsible error details). */
  children?: React.ReactNode
  /** `surface` draws its own dashed glass panel; `plain` sits inside an existing card. */
  variant?: 'surface' | 'plain'
  /** `danger` tints the icon tile for error and crash states. */
  tone?: 'neutral' | 'danger'
  /** `compact` for in-card states (lists, panels); `default` for page-level states. */
  size?: 'default' | 'compact'
  /** `h1` when the empty state is the whole page (e.g. not found). */
  headingLevel?: 'h1' | 'h2' | 'h3'
  className?: string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  children,
  variant = 'surface',
  tone = 'neutral',
  size = 'default',
  headingLevel: Heading = 'h2',
  className,
}: EmptyStateProps) {
  const compact = size === 'compact'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-3 px-4 py-8' : 'gap-4 px-6 py-14 sm:py-16',
        variant === 'surface' &&
          'border-border-hover bg-card rounded-[var(--radius-xl)] border border-dashed',
        className
      )}
    >
      {Icon ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-md border',
            tone === 'danger'
              ? 'border-destructive/30 bg-destructive/12 text-destructive'
              : 'border-border-hover bg-accent-muted text-foreground',
            compact ? 'size-10' : 'size-12'
          )}
        >
          <Icon className={compact ? 'size-4' : 'size-5'} aria-hidden={true} />
        </div>
      ) : null}
      <div className="flex max-w-[44ch] flex-col gap-1.5">
        <Heading
          className={cn(
            'text-foreground font-bold tracking-tight',
            compact ? 'text-base' : 'text-lg sm:text-xl'
          )}
        >
          {title}
        </Heading>
        {description ? (
          <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-col items-stretch gap-2 pt-1 sm:flex-row sm:items-center">
          {action}
        </div>
      ) : null}
      {children}
    </div>
  )
}
