import { useState, useEffect, useRef, memo } from 'react'
import dayjs from 'dayjs'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { usePriceHistoryStore } from '@/stores/price-history-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import type { PriceChange } from '@/types/price-history'

interface PriceHistoryBadgeProps {
  subscriptionId: string
  currency: CurrencyCode
}

export const PriceHistoryBadge = memo(function PriceHistoryBadge({
  subscriptionId,
  currency,
}: PriceHistoryBadgeProps) {
  const [latest, setLatest] = useState<PriceChange | null>(null)
  const [history, setHistory] = useState<PriceChange[]>([])
  const [showPopover, setShowPopover] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const badgeRef = useRef<HTMLButtonElement>(null)
  const { getLatest, fetchBySubscription } = usePriceHistoryStore()

  useEffect(() => {
    getLatest(subscriptionId).then(setLatest)
  }, [subscriptionId, getLatest])

  useEffect(() => {
    if (showPopover) {
      fetchBySubscription(subscriptionId).then(setHistory)
    }
  }, [showPopover, subscriptionId, fetchBySubscription])

  // Close popover on outside click
  useEffect(() => {
    if (!showPopover) return

    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        badgeRef.current &&
        !badgeRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false)
      }
    }

    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPopover])

  if (!latest) return null

  const diff = latest.new_amount - latest.old_amount
  const isIncrease = diff > 0
  const percentage = latest.old_amount > 0 ? Math.abs(diff / latest.old_amount) * 100 : 0

  return (
    <div className="relative inline-block">
      <button
        ref={badgeRef}
        onClick={() => setShowPopover(!showPopover)}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider uppercase transition-colors ${
          isIncrease
            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
            : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
        }`}
      >
        {isIncrease ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
        {isIncrease ? '+' : '-'}
        {formatCurrency(Math.abs(diff), currency)} ({percentage.toFixed(0)}%)
      </button>

      {showPopover && (
        <div
          ref={popoverRef}
          className="border-border absolute top-full right-0 z-50 mt-2 w-72 rounded-xl border bg-[#0a0a0a] p-4 shadow-xl"
        >
          <h4 className="text-foreground mb-3 font-[family-name:var(--font-heading)] text-sm font-bold">
            Price History
          </h4>

          {history.length === 0 ? (
            <p className="text-muted-foreground text-xs">No price changes recorded.</p>
          ) : (
            <div className="flex max-h-48 flex-col gap-2 overflow-y-auto">
              {history.map((entry) => {
                const entryDiff = entry.new_amount - entry.old_amount
                const entryIsIncrease = entryDiff > 0

                return (
                  <div
                    key={entry.id}
                    className="border-border flex items-center justify-between rounded-lg border bg-white/[0.02] px-3 py-2"
                  >
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] line-through">
                          {formatCurrency(entry.old_amount, currency)}
                        </span>
                        <span className="text-muted-foreground text-[10px]">&rarr;</span>
                        <span className="text-foreground font-[family-name:var(--font-mono)] text-xs font-semibold">
                          {formatCurrency(entry.new_amount, currency)}
                        </span>
                      </div>
                      <span className="text-dimmed font-[family-name:var(--font-mono)] text-[9px]">
                        {dayjs(entry.changed_at).format('MMM D, YYYY')}
                      </span>
                    </div>
                    <span
                      className={`font-[family-name:var(--font-mono)] text-[10px] font-semibold ${
                        entryIsIncrease ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {entryIsIncrease ? '+' : ''}
                      {formatCurrency(entryDiff, currency)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
