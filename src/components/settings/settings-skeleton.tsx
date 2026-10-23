import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function SectionHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-36" />
      <Skeleton className="h-4 w-60 max-w-full" />
    </div>
  )
}

/**
 * Mirrors the live settings layout (nav rail, then sections in order) while settings load.
 * The page header renders for real above it, so the route keeps its h1.
 */
export function SettingsSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">Loading settings</span>

      <div className="flex gap-10" aria-hidden="true">
        <div className="hidden w-48 shrink-0 flex-col gap-2 lg:flex">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>

        <div className="flex max-w-3xl min-w-0 flex-1 flex-col gap-6">
          {/* Appearance: theme buttons and the currency field */}
          <Card className="flex flex-col gap-5">
            <SectionHeader />
            <div className="grid grid-cols-3 gap-2 sm:max-w-md">
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
              <Skeleton className="h-10" />
            </div>
            <Skeleton className="h-10 w-full sm:max-w-md" />
          </Card>

          {/* Budget */}
          <Card className="flex flex-col gap-5">
            <SectionHeader />
            <Skeleton className="h-10 w-full sm:w-56" />
          </Card>

          {/* Notifications: switch row and reminder chips */}
          <Card className="flex flex-col gap-5">
            <SectionHeader />
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-16" />
              ))}
            </div>
          </Card>

          {/* Categories: list rows */}
          <Card className="flex flex-col gap-5">
            <SectionHeader />
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-8 shrink-0" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto size-8" />
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  )
}
