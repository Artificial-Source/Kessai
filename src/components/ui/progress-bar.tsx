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
  className,
}: ProgressBarProps) {
  const clampedValue = Math.min(Math.max(value, 0), 100)
  const trackClass = cn(
    'relative overflow-hidden bg-[var(--color-subtle-overlay)]',
    heightMap[height],
    roundedMap[rounded],
    className
  )
  const fillClass = cn(
    'absolute inset-y-0 left-0 transition-all duration-500',
    roundedMap[rounded],
    color
  )

  return (
    <div className={trackClass}>
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
