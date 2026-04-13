import { cn } from '@/lib/utils'

interface AppLogoProps {
  compact?: boolean
  className?: string
}

export function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <img src="/kessai-logo.png" alt="Kessai" className="h-full w-full object-contain" />
      </div>
      {!compact ? (
        <div className="min-w-0">
          <p className="text-foreground text-[15px] leading-5 font-semibold tracking-tight">
            Kessai
          </p>
          <p className="text-muted-foreground text-xs leading-4">Subscription clarity</p>
        </div>
      ) : null}
    </div>
  )
}
