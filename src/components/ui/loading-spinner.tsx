import { cn } from '@/lib/utils'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          'h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary',
          className
        )}
      />
    </div>
  )
}
