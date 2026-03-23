import { cn } from '@/lib/utils'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" role="status" aria-live="polite">
      <div
        aria-hidden="true"
        className={cn(
          'border-primary/20 border-t-primary h-8 w-8 animate-spin rounded-full border-2',
          className
        )}
      />
      <span className="sr-only">Loading</span>
    </div>
  )
}
