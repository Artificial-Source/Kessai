import { useEffect, useState, useMemo } from 'react'
import { cn } from '@/lib/utils'

type StatsCardProps = {
  title: string
  value: string | number
  icon: React.ReactNode
  color?: string
  trend?: {
    value: number
    isPositive: boolean
  }
  animate?: boolean
}

function parseNumericValue(value: string) {
  const numericMatch = value.match(/[\d,.]+/)
  if (!numericMatch) return null

  const targetNum = parseFloat(numericMatch[0].replace(/,/g, ''))
  const prefix = value.slice(0, value.indexOf(numericMatch[0]))
  const suffix = value.slice(value.indexOf(numericMatch[0]) + numericMatch[0].length)

  return { targetNum, prefix, suffix }
}

export function StatsCard({
  title,
  value,
  icon,
  color = 'text-aurora-purple',
  trend,
  animate = true,
}: StatsCardProps) {
  const shouldAnimate = animate && typeof value === 'string'
  const parsed = useMemo(
    () => (shouldAnimate ? parseNumericValue(value as string) : null),
    [shouldAnimate, value]
  )

  const staticValue = !shouldAnimate || !parsed ? String(value) : null
  const [animatedValue, setAnimatedValue] = useState<string | null>(null)

  useEffect(() => {
    if (!shouldAnimate || !parsed) return

    const { targetNum, prefix, suffix } = parsed
    let current = 0
    const duration = 1000
    const steps = 30
    const increment = targetNum / steps

    setAnimatedValue(`${prefix}0.00${suffix}`)

    const timer = setInterval(() => {
      current += increment
      if (current >= targetNum) {
        setAnimatedValue(value as string)
        clearInterval(timer)
      } else {
        const formatted = current.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
        setAnimatedValue(`${prefix}${formatted}${suffix}`)
      }
    }, duration / steps)

    return () => clearInterval(timer)
  }, [value, shouldAnimate, parsed])

  const displayValue = staticValue ?? animatedValue ?? '0'

  return (
    <div className="glass-card p-6 transition-transform hover:scale-[1.02]">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">{title}</p>
          <p className="text-2xl font-bold">{displayValue}</p>
          {trend && (
            <p className={cn('text-xs', trend.isPositive ? 'text-success' : 'text-destructive')}>
              {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}% from last month
            </p>
          )}
        </div>
        <div className={cn('rounded-lg bg-white/5 p-3', color)}>{icon}</div>
      </div>
    </div>
  )
}
