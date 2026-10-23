import { cn } from '@/lib/utils'

interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number
  /** Tailwind color class (e.g. "bg-primary") or undefined to use inline style */
  color?: string
  /** Inline CSS color value — used when color is not a Tailwind class (e.g. a hex from data) */
  colorStyle?: string
  /** Height variant — defaults to "sm" (h-1.5) */
  height?: 'xs' | 'sm' | 'md'
  /** Border radius — defaults to "sm" */
  rounded?: 'sm' | 'full'
  /**
   * Accessible name. With a label the bar is exposed as a `progressbar`; without one it is
   * decorative (hidden from assistive tech) and the adjacent text must carry the value.
   */
  label?: string
  className?: string
}

const heightMap: Record<NonNullable<ProgressBarProps['height']>, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
}

const roundedMap: Record<NonNullable<ProgressBarProps['rounded']>, string> = {
  sm: 'rounded-sm',
  full: 'rounded-full',
}

export function ProgressBar({
  value,
  color,
  colorStyle,
  height = 'sm',
  rounded = 'sm',
  label,
  className,
}: ProgressBarProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)
  const trackClass = cn(
    'bg-accent-muted relative overflow-hidden',
    heightMap[height],
    roundedMap[rounded],
    className
  )
  const fillClass = cn(
    'absolute inset-y-0 left-0 transition-[width] duration-500 ease-[var(--ease-emphasized)]',
    roundedMap[rounded],
    color
  )
  const semantics = label
    ? ({
        role: 'progressbar',
        'aria-label': label,
        'aria-valuemin': 0,
        'aria-valuemax': 100,
        'aria-valuenow': Math.round(clampedValue),
      } as const)
    : ({ 'aria-hidden': true } as const)

  return (
    <div className={trackClass} {...semantics}>
      <div
        className={fillClass}
        style={{
          width: `${clampedValue}%`,
          ...(colorStyle && !color ? { backgroundColor: colorStyle } : {}),
        }}
      />
    </div>
  )
}
