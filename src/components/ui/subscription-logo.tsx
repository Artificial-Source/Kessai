import { useEffect, useState } from 'react'
import { getLogoDataUrl } from '@/lib/logo-storage'
import { readableInkOn } from '@/lib/color'
import { cn } from '@/lib/utils'

interface SubscriptionLogoProps {
  logoUrl: string | null | undefined
  name: string
  color?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /** Empty alt when the name is already rendered as text next to the logo. */
  decorative?: boolean
}

const sizeClasses = {
  sm: 'h-5 w-5 text-[11px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-xl',
}

export function SubscriptionLogo({
  logoUrl,
  name,
  color,
  size = 'md',
  className,
  decorative = false,
}: SubscriptionLogoProps) {
  const [state, setState] = useState<{ dataUrl: string | null; isLoading: boolean }>({
    dataUrl: null,
    isLoading: !!logoUrl,
  })

  useEffect(() => {
    if (!logoUrl) return

    // Bundled static logos (e.g. /logos/templates/xxx.png) — use directly
    if (logoUrl.startsWith('/logos/')) {
      setState({ dataUrl: logoUrl, isLoading: false })
      return
    }

    let cancelled = false

    getLogoDataUrl(logoUrl)
      .then((url) => {
        if (!cancelled) setState({ dataUrl: url, isLoading: false })
      })
      .catch(() => {
        if (!cancelled) setState({ dataUrl: null, isLoading: false })
      })

    return () => {
      cancelled = true
    }
  }, [logoUrl])

  const { dataUrl, isLoading } = state

  const sizeClass = sizeClasses[size]

  if (isLoading) {
    return (
      <div
        aria-hidden="true"
        className={cn(sizeClass, 'bg-surface-highest/60 animate-pulse', className)}
      />
    )
  }

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={decorative ? '' : name}
        loading="lazy"
        decoding="async"
        className={cn(sizeClass, 'border-border-hover border object-cover', className)}
      />
    )
  }

  return (
    <div
      aria-hidden="true"
      className={cn(
        sizeClass,
        'flex items-center justify-center font-bold',
        color && 'border-border-hover border',
        !color && 'text-foreground',
        className
      )}
      style={{
        backgroundColor: color || 'var(--color-surface-highest)',
        ...(color ? { color: readableInkOn(color) } : {}),
      }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
