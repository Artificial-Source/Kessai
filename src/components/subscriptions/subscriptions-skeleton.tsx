import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ViewMode } from '@/components/subscriptions/subscriptions-toolbar'

/** Placeholder for the toolbar and results, shaped like the saved view mode. */
export function SubscriptionsSkeleton({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading subscriptions</span>

      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="flex items-center gap-2 md:gap-3">
          <Skeleton className="h-10 flex-1 md:max-w-xs pointer-coarse:h-11" />
          <Skeleton className="h-10 w-24 md:hidden pointer-coarse:h-11" />
          <Skeleton className="hidden h-10 w-56 md:block" />
          <Skeleton className="hidden h-10 w-44 md:block" />
          <Skeleton className="ml-auto hidden h-9 w-28 md:block" />
        </div>
        <div className="hidden flex-wrap gap-2 md:flex">
          {[28, 20, 24, 18, 22, 26].map((width, i) => (
            <Skeleton key={i} className="h-9 rounded-md" style={{ width: `${width * 4}px` }} />
          ))}
        </div>
      </div>

      {viewMode === 'bento' ? (
        <Skeleton
          aria-hidden="true"
          className="w-full rounded-sm"
          style={{ height: 'clamp(420px, calc(100dvh - 220px), 720px)' }}
        />
      ) : viewMode === 'grid' ? (
        <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 md:gap-5 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} padding="none">
              <div className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between">
                  <Skeleton className="size-12 rounded-xl" />
                  <Skeleton className="h-5 w-16 rounded-sm" />
                </div>
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-7 w-28" />
              </div>
              <div className="border-border flex h-14 items-center justify-between border-t px-5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-6 w-16" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card aria-hidden="true" padding="none" className="divide-border divide-y">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24 lg:hidden" />
              </div>
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="hidden h-3 w-24 lg:block" />
              <Skeleton className="h-5 w-16 rounded-sm" />
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
