import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Glass surface for page sections. Blur-free by policy (see globals.css). Static cards do
 * not react to hover; pass `interactive` only when the whole card is a control.
 * Use `asChild` to render a semantic element (`<section>`, `<button>`, `<a>`).
 */
const cardVariants = cva('glass-card text-card-foreground', {
  variants: {
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-5',
      lg: 'p-6',
    },
    tone: {
      default: '',
      info: 'border-info/25',
      warning: 'border-warning/25 bg-warning/5',
      danger: 'border-destructive/30 bg-destructive/5',
    },
    interactive: {
      true: 'hover-lift cursor-pointer text-left transition-[border-color,transform] duration-150 hover:border-border-hover',
      false: '',
    },
  },
  defaultVariants: {
    padding: 'md',
    tone: 'default',
    interactive: false,
  },
})

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {
  asChild?: boolean
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, padding, tone, interactive, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'div'
    return (
      <Comp
        ref={ref}
        className={cn(cardVariants({ padding, tone, interactive }), className)}
        {...props}
      />
    )
  }
)
Card.displayName = 'Card'

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Trailing control aligned with the title (e.g. an "Add" button or a link). */
  action?: React.ReactNode
}

function CardHeader({ className, action, children, ...props }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)} {...props}>
      <div className="flex min-w-0 flex-col gap-1">{children}</div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  )
}

const CardTitle = React.forwardRef<HTMLHeadingElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, children, ...props }, ref) => (
    <h2
      ref={ref}
      className={cn('text-foreground text-lg leading-tight font-bold tracking-tight', className)}
      {...props}
    >
      {children}
    </h2>
  )
)
CardTitle.displayName = 'CardTitle'

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-muted-foreground text-sm', className)} {...props} />
}

export { Card, CardHeader, CardTitle, CardDescription }
