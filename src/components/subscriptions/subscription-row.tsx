import type * as React from 'react'
import { Pin } from 'lucide-react'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { cn } from '@/lib/utils'
import type { Subscription } from '@/types/subscription'

/**
 * Subscription rows share one DOM at every width. Below `lg` a row stacks (name and actions,
 * then cost · date and status, then the due-payment action); from `lg` the same cells line up
 * as table columns under `SubscriptionRowHeader`. Fixed tracks keep columns aligned across rows.
 */
const COLUMNS =
  'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 lg:grid-cols-[minmax(0,1fr)_7.5rem_8rem_10.5rem_7.5rem_4.5rem]'

export function SubscriptionRowHeader({ dateLabel }: { dateLabel: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        COLUMNS,
        'type-label text-muted-foreground border-border hidden border-b bg-[var(--color-subtle-overlay)] px-4 py-3 lg:grid'
      )}
    >
      <span>Service</span>
      <span>Cost</span>
      <span>{dateLabel}</span>
      <span>Status</span>
    </div>
  )
}

interface SubscriptionRowProps {
  subscription: Subscription
  /** Fallback tile color when the subscription has neither logo nor color. */
  logoColor?: string | null
  /** Badges or a short line under the name (category, tags, cancellation reason). */
  details?: React.ReactNode
  cost: React.ReactNode
  /** Short date text; the column header names it on wide screens. */
  date: React.ReactNode
  /** Visible before the date on stacked rows, where there is no column header. */
  datePrefix: string
  status: React.ReactNode
  /** The row's due-payment action, shown in full on every width. */
  primaryAction?: React.ReactNode
  /** Icon buttons: edit and the overflow menu. */
  actions: React.ReactNode
}

export function SubscriptionRow({
  subscription,
  logoColor,
  details,
  cost,
  date,
  datePrefix,
  status,
  primaryAction,
  actions,
}: SubscriptionRowProps) {
  const dimmed = !subscription.is_active

  return (
    <li
      className={cn(
        COLUMNS,
        'items-center gap-y-2 px-4 py-3 transition-colors duration-150 lg:hover:bg-[var(--color-subtle-overlay)]'
      )}
    >
      <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-3">
        <SubscriptionLogo
          logoUrl={subscription.logo_url}
          name={subscription.name}
          color={subscription.color || logoColor}
          size="md"
          decorative
          className={cn('shrink-0 rounded-lg', dimmed && 'opacity-50 grayscale')}
        />
        <div className="flex min-w-0 flex-col gap-1">
          <p className="flex min-w-0 items-center gap-1.5">
            <span className="text-foreground truncate font-medium" title={subscription.name}>
              {subscription.name}
            </span>
            {subscription.is_pinned && (
              <>
                <Pin
                  aria-hidden="true"
                  className="text-foreground size-3.5 shrink-0 fill-current"
                />
                <span className="sr-only">(pinned)</span>
              </>
            )}
          </p>
          {details}
        </div>
      </div>

      {/* Stacked: one wrapping "cost · date  status" line under the name. Wide: three cells. */}
      <div className="text-muted-foreground col-span-2 col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 pl-[3.25rem] text-sm lg:contents">
        <div className="lg:col-start-2 lg:row-start-1">{cost}</div>
        <span aria-hidden="true" className="lg:hidden">
          ·
        </span>
        <div className="lg:col-start-3 lg:row-start-1 lg:text-xs">
          <span className="lg:hidden">{datePrefix} </span>
          {date}
        </div>
        <div className="ml-auto lg:col-start-4 lg:row-start-1 lg:ml-0">{status}</div>
      </div>

      {primaryAction ? (
        <div className="col-span-2 col-start-1 row-start-3 pl-[3.25rem] lg:col-span-1 lg:col-start-5 lg:row-start-1 lg:pl-0">
          {primaryAction}
        </div>
      ) : null}

      <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 lg:col-start-6">
        {actions}
      </div>
    </li>
  )
}
