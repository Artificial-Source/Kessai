import * as React from 'react'
import { cn } from '@/lib/utils'

export interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange'
> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

/**
 * Binary setting toggle. On: inverted primary track with a contrasting thumb. Off: a
 * visible neutral track in both themes. The pseudo-element widens the hit area to 44px
 * tall without changing layout. Always pass an accessible name (`aria-label` or a
 * `<Label htmlFor>`).
 */
const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, checked = false, onCheckedChange, disabled, ...props }, ref) => {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        ref={ref}
        onClick={() => onCheckedChange?.(!checked)}
        className={cn(
          'peer relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors duration-150',
          'after:absolute after:-inset-x-1 after:-inset-y-2.5 after:content-[""]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked
            ? 'bg-primary border-primary'
            : 'bg-surface-highest border-input-border hover:border-border-hover',
          className
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none block size-4.5 rounded-full shadow-sm transition-transform duration-150 ease-[var(--ease-emphasized)]',
            checked
              ? 'bg-primary-foreground translate-x-[22px]'
              : 'bg-muted-foreground translate-x-[2px]'
          )}
        />
      </button>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
