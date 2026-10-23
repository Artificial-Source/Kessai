import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Shared field chrome for Input, Textarea, and SelectTrigger: filled glass well, visible
 * resting border, strong focus outline (from the global :focus-visible rule), and an error
 * state driven by `aria-invalid` so the visual and accessible states never drift apart.
 */
export const fieldClassName =
  'w-full rounded-md border border-input-border bg-input text-foreground transition-[border-color,background-color] duration-150 placeholder:text-muted-foreground hover:border-border-hover pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:outline-destructive'

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<'input'>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          fieldClassName,
          'file:text-foreground flex h-10 px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({ className, rows = 3, ...props }, ref) => {
    return (
      <textarea
        rows={rows}
        className={cn(
          fieldClassName,
          'min-h-20 resize-y px-3 py-2 text-base md:text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

export { Input, Textarea }
