import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/** Placeholder for the dashboard body (the page header renders for real while loading). */
export function DashboardSkeleton() {
  return (
    <div role="status" className="flex flex-col gap-5 xl:gap-6">
      <span className="sr-only">Loading dashboard</span>

      <Card aria-hidden="true" padding="none" className="p-4 sm:p-5">
        <div className="grid gap-x-10 gap-y-5 md:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-32 rounded-sm" />
            <Skeleton className="h-8 w-40 sm:h-9" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-col gap-2.5">
            <Skeleton className="h-3 w-28 rounded-sm" />
            <Skeleton className="h-2 w-full rounded-sm" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="mt-5 h-4 w-80 max-w-full" />
      </Card>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:gap-6">
        <Card aria-hidden="true" padding="none" className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="divide-border mt-4 divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 py-3.5">
                <Skeleton className="size-9 rounded-md" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-4 w-36 max-w-full" />
                  <Skeleton className="h-3 w-24 max-w-full" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </Card>

        <Card aria-hidden="true" padding="none" className="flex flex-col gap-3 p-4 sm:p-5">
          <Skeleton className="h-5 w-28" />
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5 py-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-48 max-w-full" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
