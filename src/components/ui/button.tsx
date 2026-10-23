import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress pointer-coarse:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        glow: 'bg-primary text-primary-foreground shadow-ambient-sm hover:bg-primary/90 hover:shadow-ambient-strong',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-input-border bg-transparent text-foreground hover:border-border-hover hover:bg-accent-muted aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-surface-highest',
        ghost:
          'text-foreground hover:bg-accent-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary/90',
        link: 'text-foreground underline decoration-border-hover underline-offset-4 hover:decoration-foreground active:translate-y-0',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3 text-xs',
        icon: 'size-10 pointer-coarse:min-w-11',
        'icon-sm': 'size-8 rounded-sm pointer-coarse:min-w-11',
      },
    },
    compoundVariants: [{ variant: 'link', class: 'h-auto px-0' }],
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

type ButtonVariantProps = VariantProps<typeof buttonVariants>
type IconSize = 'icon' | 'icon-sm'

type ButtonBaseProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> &
  Omit<ButtonVariantProps, 'size'> & {
    asChild?: boolean
  }

/**
 * Icon-only sizes have no visible text, so they require an accessible name.
 * Text sizes may still pass `aria-label` when the visible text needs more context.
 */
export type ButtonProps = ButtonBaseProps &
  (
    | { size: IconSize; 'aria-label': string }
    | { size?: Exclude<ButtonVariantProps['size'], IconSize>; 'aria-label'?: string }
  )

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, type, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        type={asChild ? type : (type ?? 'button')}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
