import { Link, useLocation } from 'react-router-dom'
import { Compass, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Kbd } from '@/components/ui/kbd'
import { useUiStore } from '@/stores/ui-store'
import { modifierKeyLabel } from '@/lib/keyboard'

export function NotFoundPage() {
  const { pathname } = useLocation()
  const openCommandPalette = useUiStore((s) => s.openCommandPalette)

  return (
    <div className="animate-fade-in-up flex min-h-[60vh] items-center justify-center py-8">
      <EmptyState
        icon={Compass}
        headingLevel="h1"
        title="Page not found"
        description={
          <>
            Nothing lives at{' '}
            <code className="text-foreground font-[family-name:var(--font-mono)] text-xs break-all">
              {pathname}
            </code>
            . The link may be mistyped, or the page moved.
          </>
        }
        action={
          <>
            <Button asChild>
              <Link to="/">Back to Dashboard</Link>
            </Button>
            <Button variant="outline" onClick={openCommandPalette}>
              <Search aria-hidden="true" />
              Search
              <span aria-hidden="true" className="flex gap-1">
                <Kbd className="h-5">{modifierKeyLabel()}</Kbd>
                <Kbd className="h-5">K</Kbd>
              </span>
            </Button>
          </>
        }
        className="w-full max-w-xl"
      />
    </div>
  )
}
