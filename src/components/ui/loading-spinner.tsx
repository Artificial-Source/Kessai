import { cn } from '@/lib/utils'

export function LoadingSpinner({ className }: { className?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <div
        role="status"
        aria-label="Loading"
        className={cn(
          'border-primary/20 border-t-primary h-8 w-8 animate-spin rounded-full border-2',
          className
        )}
      />
    </div>
  )
}
