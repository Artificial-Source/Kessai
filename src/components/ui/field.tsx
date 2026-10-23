import type * as React from 'react'

import { cn } from '@/lib/utils'

type FieldTextProps = React.HTMLAttributes<HTMLParagraphElement>

/**
 * Helper text under a control. Give it an `id` and point the control's
 * `aria-describedby` at it.
 */
export function FieldHint({ className, ...props }: FieldTextProps) {
  return <p className={cn('text-muted-foreground text-xs leading-relaxed', className)} {...props} />
}

/**
 * Inline validation message. Renders nothing without content so it can sit in the
 * markup unconditionally. Pair with `aria-invalid` and `aria-describedby` on the control.
 */
export function FieldError({ className, children, ...props }: FieldTextProps) {
  if (!children) return null

  return (
    <p role="alert" className={cn('text-destructive text-xs font-medium', className)} {...props}>
      {children}
    </p>
  )
}
