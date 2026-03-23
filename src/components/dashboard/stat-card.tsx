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
    <div
      className="glass-card hover-lift group p-5 transition-colors hover:border-[var(--color-border-hover)]"
      role="status"
      aria-label={`${label}: ${value}`}
    >
      <div className="mb-4 flex items-start justify-between">
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[11px] font-normal tracking-wider uppercase">
          {label}
        </p>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBg} ${iconColor}`}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-foreground font-[family-name:var(--font-heading)] text-3xl leading-none font-bold tracking-tight">
        {value}
      </p>
      {subtitle && (
        <p
          className={`mt-2 font-[family-name:var(--font-mono)] text-[11px] ${subtitleColor || 'text-muted-foreground'}`}
        >
          {subtitle}
        </p>
      )}
    </div>
  )
})
