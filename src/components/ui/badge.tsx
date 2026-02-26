import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full font-medium font-[family-name:var(--font-mono)] uppercase tracking-wider transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary/20 text-primary border border-primary/30',
        secondary: 'bg-muted text-muted-foreground border border-border',
        success: 'bg-success/20 text-success border border-success/30',
        warning: 'bg-warning/20 text-warning border border-warning/30',
        danger: 'bg-danger/20 text-danger border border-danger/30',
        outline: 'bg-transparent border border-border text-foreground',
        entertainment:
          'bg-cat-entertainment/20 text-cat-entertainment border border-cat-entertainment/30',
        software: 'bg-cat-software/20 text-cat-software border border-cat-software/30',
        music: 'bg-cat-music/20 text-cat-music border border-cat-music/30',
        health: 'bg-cat-health/20 text-cat-health border border-cat-health/30',
        shopping: 'bg-cat-shopping/20 text-cat-shopping border border-cat-shopping/30',
        ai: 'bg-cat-ai/20 text-cat-ai border border-cat-ai/30',
        cloud: 'bg-cat-cloud/20 text-cat-cloud border border-cat-cloud/30',
        productivity:
          'bg-cat-productivity/20 text-cat-productivity border border-cat-productivity/30',
        development: 'bg-cat-development/20 text-cat-development border border-cat-development/30',
        security: 'bg-cat-security/20 text-cat-security border border-cat-security/30',
      },
      size: {
        sm: 'px-2 py-0.5 text-[10px]',
        md: 'px-2.5 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-xs',
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
  dot?: boolean
  dotColor?: string
}

export function Badge({ className, variant, size, dot, dotColor, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {dot && (
        <span
          className="mr-1.5 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: dotColor || 'currentColor' }}
        />
      )}
      {children}
    </span>
  )
}

export { badgeVariants }
