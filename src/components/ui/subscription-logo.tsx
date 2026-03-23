import { useEffect, useState } from 'react'
import { getLogoDataUrl } from '@/lib/logo-storage'
import { cn } from '@/lib/utils'

interface SubscriptionLogoProps {
  logoUrl: string | null | undefined
  name: string
  color?: string | null
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  sm: 'h-5 w-5 text-[10px]',
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
      <div className={cn(sizeClass, 'animate-pulse bg-[var(--color-subtle-overlay)]', className)} />
    )
  }

  if (dataUrl) {
    return (
      <img
        src={dataUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        className={cn(sizeClass, 'border border-white/20 object-cover', className)}
      />
    )
  }

  return (
    <div
      className={cn(sizeClass, 'flex items-center justify-center font-bold text-white', className)}
      style={{ backgroundColor: color || '#bf5af2' }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  )
}
