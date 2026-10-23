import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Crisp data label: Space Mono, uppercase, 4px corners. Tone variants carry status;
 * data colors (category, tag) go in the dot on a neutral badge, never in the text.
 * Status tones (see DESIGN.md): trial → info, active → success, paused/grace → warning,
 * cancelling → caution, cancelled/expired → danger.
 */
const badgeVariants = cva(
  'inline-flex max-w-full items-center gap-1.5 rounded-sm border font-[family-name:var(--font-mono)] font-medium whitespace-nowrap uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'border-border-hover bg-accent-muted text-foreground',
        secondary: 'border-border bg-muted text-muted-foreground',
        outline: 'border-border-hover bg-transparent text-foreground',
        success: 'border-success/30 bg-success/12 text-success',
        warning: 'border-warning/30 bg-warning/12 text-warning',
        danger: 'border-destructive/30 bg-destructive/12 text-destructive',
        info: 'border-info/30 bg-info/12 text-info',
        caution: 'border-accent-orange/30 bg-accent-orange/12 text-accent-orange',
      },
      size: {
        sm: 'h-5 px-1.5 text-[11px]',
        md: 'h-6 px-2 text-[11px]',
        lg: 'h-7 px-2.5 text-xs',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export type BadgeVariant = VariantProps<typeof badgeVariants>['variant']

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Leading color dot; use with a data color (e.g. a category's hex) on a neutral badge. */
  dot?: boolean
  dotColor?: string
}

export function Badge({ className, variant, size, dot, dotColor, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: dotColor || 'currentColor' }}
        />
      )}
      {children}
    </span>
  )
}

export { badgeVariants }
