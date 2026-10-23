import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Placeholder for the dashboard body (the page header renders for real while loading). */
export function DashboardSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-6">
      <span className="sr-only">Loading dashboard</span>

      <div className="grid grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4 xl:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} aria-hidden="true" className="min-w-0 p-4 md:p-5">
            <Skeleton className="h-3 w-24 max-w-full rounded-sm" />
            <Skeleton className="mt-3 h-6 w-28 max-w-full md:h-8 md:w-32" />
            <Skeleton className="mt-2 h-4 w-20 max-w-full" />
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:gap-5 lg:grid-cols-5 xl:gap-6">
        <Card aria-hidden="true" className="lg:col-span-3">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="mt-2 h-4 w-24" />
          <div className="divide-border mt-3 divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3 sm:gap-4">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card aria-hidden="true" className="lg:col-span-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-40" />
          <div className="mt-4 flex flex-col gap-3.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-16" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-sm" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
