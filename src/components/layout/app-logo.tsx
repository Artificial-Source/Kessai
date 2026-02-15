import { cn } from '@/lib/utils'

interface AppLogoProps {
  compact?: boolean
  className?: string
}

export function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <img src="/icon-mark.png" alt="Subby" className="h-9 w-9 shrink-0 object-contain" />
      {!compact ? (
        <div className="min-w-0">
          <p className="text-foreground text-[15px] leading-5 font-semibold tracking-tight">
            Subby
          </p>
          <p className="text-muted-foreground text-xs leading-4">Subscription clarity</p>
        </div>
      ) : null}
    </div>
  )
}
