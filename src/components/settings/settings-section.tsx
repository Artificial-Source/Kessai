import type * as React from 'react'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SettingsSectionProps {
  /** Anchor for the in-page section nav (`#id`). */
  id: string
  title: string
  description?: React.ReactNode
  /** Trailing header control, e.g. an "Add" button. */
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

/** One settings card: an `h2` header (the nav's jump target) above the section's controls. */
export function SettingsSection({
  id,
  title,
  description,
  action,
  children,
  className,
}: SettingsSectionProps) {
  const titleId = `${id}-title`
  return (
    <Card asChild>
      <section
        id={id}
        aria-labelledby={titleId}
        className={cn('flex scroll-mt-6 flex-col gap-5', className)}
      >
        <CardHeader action={action}>
          <CardTitle id={titleId} tabIndex={-1} className="outline-none">
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="text-pretty">{description}</CardDescription>
          ) : null}
        </CardHeader>
        {children}
      </section>
    </Card>
  )
}

interface SettingRowProps {
  label: React.ReactNode
  /** Associates the label with a native control; omit when the control names itself. */
  htmlFor?: string
  description?: React.ReactNode
  descriptionId?: string
  children: React.ReactNode
  className?: string
}

/** Label and helper text on the left, the control on the right; wraps on narrow screens. */
export function SettingRow({
  label,
  htmlFor,
  description,
  descriptionId,
  children,
  className,
}: SettingRowProps) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-x-6 gap-y-3', className)}>
      <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
        {htmlFor ? (
          <Label htmlFor={htmlFor} className="leading-snug">
            {label}
          </Label>
        ) : (
          <p className="text-foreground text-sm leading-snug font-medium">{label}</p>
        )}
        {description ? (
          <p
            id={descriptionId}
            className="text-muted-foreground text-xs leading-relaxed text-pretty"
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Rows shaped like a manager list (swatch, name, two actions) while it loads. */
export function SettingsListSkeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" className="divide-border flex flex-col divide-y">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5" aria-hidden="true">
          <Skeleton className="size-8 shrink-0" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="ml-auto size-8" />
        </div>
      ))}
    </div>
  )
}
