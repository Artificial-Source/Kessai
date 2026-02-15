import { memo } from 'react'

interface StatCardProps {
  label: string
  value: string
  subtitle?: string
  subtitleColor?: string
  icon: React.ElementType
  iconBg: string
  iconColor: string
}

export const StatCard = memo(function StatCard({
  label,
  value,
  subtitle,
  subtitleColor,
  icon: Icon,
  iconBg,
  iconColor,
}: StatCardProps) {
  return (
    <div className="glass-card hover-lift group rounded-xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-sm font-medium tracking-tight">{label}</p>
        <div
          className={`border-border/60 flex h-9 w-9 items-center justify-center rounded-md border ${iconBg} ${iconColor}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">{value}</p>
      {subtitle && (
        <p className={`mt-1.5 text-xs font-medium ${subtitleColor || 'text-muted-foreground'}`}>
          {subtitle}
        </p>
      )}
    </div>
  )
})
