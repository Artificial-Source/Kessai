import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react'
import { Pin } from 'lucide-react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { convertCurrency, convertCurrencyCached } from '@/lib/exchange-rates'
import { getLogoDataUrl } from '@/lib/logo-storage'
import {
  calculateMonthlyAmount,
  calculateNormalizedAmount,
  compareSubscriptionDisplayPriority,
  NORMALIZATION_SUFFIXES,
} from '@/types/subscription'
import type { Subscription, NormalizationPeriod } from '@/types/subscription'
import type { Category } from '@/types/category'

interface SubscriptionBentoProps {
  subscriptions: Subscription[]
  categories: Category[]
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  onEdit: (subscription: Subscription) => void
}

const BENTO_COLORS = [
  'var(--color-bento-1)',
  'var(--color-bento-2)',
  'var(--color-bento-3)',
  'var(--color-bento-4)',
  'var(--color-bento-5)',
]

const GAP = 3
const MIN_LAYOUT_VALUE = 16

interface TreemapNode {
  value: number
  layoutValue: number
  subscription: Subscription
  colorIndex: number
}

interface TreemapRect {
  x: number
  y: number
  width: number
  height: number
  node: TreemapNode
}

function worstAspectRatio(
  row: TreemapNode[],
  rowValue: number,
  side: number,
  totalRemaining: number,
  container: { width: number; height: number }
): number {
  if (row.length === 0 || rowValue === 0) return Infinity

  const area = (rowValue / totalRemaining) * container.width * container.height
  const rowLength = area / side

  let worst = 0
  for (const node of row) {
    const nodeArea = (node.layoutValue / rowValue) * area
    const nodeLength = nodeArea / rowLength
    const aspect = Math.max(rowLength / nodeLength, nodeLength / rowLength)
    worst = Math.max(worst, aspect)
  }

  return worst
}

function squarify(
  nodes: TreemapNode[],
  container: { x: number; y: number; width: number; height: number }
): TreemapRect[] {
  if (nodes.length === 0) return []

  const totalValue = nodes.reduce((sum, node) => sum + node.layoutValue, 0)
  if (totalValue === 0) return []

  const results: TreemapRect[] = []
  let remaining = [...nodes]
  let currentRect = { ...container }

  while (remaining.length > 0) {
    const isHorizontal = currentRect.width < currentRect.height
    const side = isHorizontal ? currentRect.height : currentRect.width

    const row: TreemapNode[] = []
    let rowValue = 0
    const remainingValue = remaining.reduce((sum, node) => sum + node.layoutValue, 0)

    for (const node of remaining) {
      const nextRow = [...row, node]
      const nextRowValue = rowValue + node.layoutValue

      if (row.length === 0) {
        row.push(node)
        rowValue = node.layoutValue
        continue
      }

      const currentWorst = worstAspectRatio(row, rowValue, side, remainingValue, currentRect)
      const nextWorst = worstAspectRatio(nextRow, nextRowValue, side, remainingValue, currentRect)

      if (nextWorst <= currentWorst) {
        row.push(node)
        rowValue = nextRowValue
      } else {
        break
      }
    }

    const rowArea = (rowValue / remainingValue) * currentRect.width * currentRect.height
    const rowSize = isHorizontal ? rowArea / currentRect.height : rowArea / currentRect.width

    let offset = 0
    for (const node of row) {
      const nodeSize =
        (node.layoutValue / rowValue) * (isHorizontal ? currentRect.height : currentRect.width)

      if (isHorizontal) {
        results.push({
          x: currentRect.x,
          y: currentRect.y + offset,
          width: rowSize,
          height: nodeSize,
          node,
        })
      } else {
        results.push({
          x: currentRect.x + offset,
          y: currentRect.y,
          width: nodeSize,
          height: rowSize,
          node,
        })
      }

      offset += nodeSize
    }

    if (isHorizontal) {
      currentRect = {
        x: currentRect.x + rowSize,
        y: currentRect.y,
        width: currentRect.width - rowSize,
        height: currentRect.height,
      }
    } else {
      currentRect = {
        x: currentRect.x,
        y: currentRect.y + rowSize,
        width: currentRect.width,
        height: currentRect.height - rowSize,
      }
    }

    remaining = remaining.slice(row.length)
  }

  return results
}

function formatPercentage(percentage: number): string {
  if (percentage <= 0) return '0%'
  if (percentage < 1) return `${percentage.toFixed(1)}%`
  return `${percentage.toFixed(0)}%`
}

const BentoTile = memo(function BentoTile({
  subscription,
  category,
  colorIndex,
  percentage,
  currency,
  costNormalization,
  convertedAmount,
  width,
  height,
  onEdit,
}: {
  subscription: Subscription
  category?: Category
  colorIndex: number
  percentage: number
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  convertedAmount: number
  width: number
  height: number
  onEdit: (subscription: Subscription) => void
}) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const isNormalized = costNormalization !== 'as-is'
  const displayAmount = isNormalized
    ? calculateNormalizedAmount(convertedAmount, subscription.billing_cycle, costNormalization)
    : calculateMonthlyAmount(convertedAmount, subscription.billing_cycle)
  const bgColor = BENTO_COLORS[colorIndex % BENTO_COLORS.length]

  const isLarge = width > 150 && height > 100
  const isMedium = width > 100 && height > 80
  const isTiny = width < 60 || height < 50

  useEffect(() => {
    if (!subscription.logo_url) {
      setLogoSrc(null)
      return
    }

    let isStale = false
    getLogoDataUrl(subscription.logo_url).then((src) => {
      if (!isStale) setLogoSrc(src)
    })

    return () => {
      isStale = true
    }
  }, [subscription.logo_url])

  return (
    <button
      onClick={() => onEdit(subscription)}
      className="group absolute inset-0 overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
      style={{ backgroundColor: bgColor, borderRadius: 'var(--radius-sm)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, var(--color-subtle-overlay) 0%, transparent 60%)',
        }}
      />

      <div
        className={`relative z-10 flex h-full flex-col justify-between ${
          isLarge ? 'p-4' : isMedium ? 'p-3' : 'p-2'
        }`}
      >
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <h4
              className={`text-foreground leading-tight font-bold ${
                isLarge ? 'text-base' : isMedium ? 'text-sm' : 'text-xs'
              }`}
              style={{
                display: '-webkit-box',
                WebkitLineClamp: isLarge ? 2 : 1,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {subscription.name}
            </h4>
            {isLarge && category && (
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{category.name}</p>
            )}
          </div>

          {subscription.is_pinned && (
            <Pin
              className={`text-muted-foreground fill-muted-foreground flex-shrink-0 ${
                isLarge ? 'h-4 w-4' : isMedium ? 'h-3.5 w-3.5' : 'h-3 w-3'
              }`}
            />
          )}

          {logoSrc && (
            <img
              src={logoSrc}
              alt=""
              className={`bg-surface-highest/50 flex-shrink-0 object-contain ${
                isLarge ? 'h-10 w-10 p-1.5' : isMedium ? 'h-7 w-7 p-1' : 'h-5 w-5 p-0.5'
              }`}
              style={{ borderRadius: 'var(--radius-sm)' }}
            />
          )}
        </div>

        {!isTiny && (
          <div className="flex items-end justify-between gap-1">
            <span
              className={`text-foreground font-bold ${
                isLarge ? 'text-xl' : isMedium ? 'text-base' : 'text-sm'
              }`}
            >
              {formatCurrency(displayAmount, currency)}
              {isNormalized && isLarge && (
                <span className="text-muted-foreground ml-0.5 text-xs font-normal">
                  {NORMALIZATION_SUFFIXES[costNormalization]}
                </span>
              )}
            </span>
            <span
              className={`bg-surface-highest/60 text-foreground font-semibold ${
                isLarge ? 'px-1.5 py-0.5 text-xs' : 'px-1 py-0.5 text-[10px]'
              }`}
              style={{ borderRadius: 'var(--radius-sm)' }}
            >
              {formatPercentage(percentage)}
            </span>
          </div>
        )}

        {isTiny && (
          <span
            className="bg-surface-highest/60 text-foreground px-1 py-0.5 text-[9px] font-semibold"
            style={{ borderRadius: 'var(--radius-sm)', alignSelf: 'flex-end' }}
          >
            {formatPercentage(percentage)}
          </span>
        )}
      </div>

      {!subscription.is_active && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-overlay)]">
          <span
            className="bg-surface-elevated/90 text-foreground px-2 py-0.5 text-xs font-medium"
            style={{ borderRadius: 'var(--radius-sm)' }}
          >
            Paused
          </span>
        </div>
      )}
    </button>
  )
})

export function SubscriptionBento({
  subscriptions,
  categories,
  currency,
  costNormalization,
  onEdit,
}: SubscriptionBentoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [convertedAmounts, setConvertedAmounts] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return

      const rect = entry.target.getBoundingClientRect()
      setContainerSize({ width: rect.width, height: rect.height })
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  const getConvertedAmount = useCallback(
    (sub: Subscription): number => {
      const resolved = convertedAmounts[sub.id]
      if (resolved !== undefined) return resolved

      const subCurrency = (sub.currency || currency) as CurrencyCode
      if (subCurrency === currency) return sub.amount
      return convertCurrencyCached(sub.amount, subCurrency, currency) ?? sub.amount
    },
    [convertedAmounts, currency]
  )

  useEffect(() => {
    let cancelled = false

    const resolveConvertedAmounts = async () => {
      const entries = await Promise.all(
        subscriptions.map(async (sub) => {
          const subCurrency = (sub.currency || currency) as CurrencyCode
          if (subCurrency === currency) {
            return [sub.id, sub.amount] as const
          }

          const converted = await convertCurrency(sub.amount, subCurrency, currency)
          return [sub.id, converted] as const
        })
      )

      if (!cancelled) {
        setConvertedAmounts(Object.fromEntries(entries))
      }
    }

    void resolveConvertedAmounts()

    return () => {
      cancelled = true
    }
  }, [subscriptions, currency])

  const sortedSubscriptions = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      const priority = compareSubscriptionDisplayPriority(a, b)
      if (priority !== 0) return priority

      const amountA = calculateMonthlyAmount(getConvertedAmount(a), a.billing_cycle)
      const amountB = calculateMonthlyAmount(getConvertedAmount(b), b.billing_cycle)
      return amountB - amountA
    })
  }, [subscriptions, getConvertedAmount])

  const totalMonthly = useMemo(() => {
    return subscriptions.reduce(
      (sum, sub) => sum + calculateMonthlyAmount(getConvertedAmount(sub), sub.billing_cycle),
      0
    )
  }, [subscriptions, getConvertedAmount])

  const treemapRects = useMemo((): TreemapRect[] => {
    if (
      containerSize.width === 0 ||
      containerSize.height === 0 ||
      sortedSubscriptions.length === 0
    ) {
      return []
    }

    const nodes: TreemapNode[] = sortedSubscriptions.map((sub, index) => {
      const monthlyValue = calculateMonthlyAmount(getConvertedAmount(sub), sub.billing_cycle)

      return {
        value: monthlyValue,
        layoutValue: Math.sqrt(Math.max(monthlyValue, 0) + MIN_LAYOUT_VALUE),
        subscription: sub,
        colorIndex: index,
      }
    })

    return squarify(nodes, {
      x: 0,
      y: 0,
      width: containerSize.width,
      height: containerSize.height,
    })
  }, [sortedSubscriptions, containerSize, getConvertedAmount])

  const getCategory = useCallback(
    (categoryId: string | null) => {
      if (!categoryId) return undefined
      return categories.find((category) => category.id === categoryId)
    },
    [categories]
  )

  if (subscriptions.length === 0) {
    return (
      <div
        className="border-border flex h-[400px] items-center justify-center border border-dashed"
        style={{ borderRadius: 'var(--radius-sm)' }}
      >
        <p className="text-muted-foreground">No subscriptions to display</p>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{
        height: 'clamp(420px, calc(100vh - 220px), 720px)',
        minHeight: '420px',
        contain: 'layout style',
      }}
    >
      <div className="absolute inset-0" style={{ contain: 'strict' }}>
        {treemapRects.map((rect) => {
          const width = rect.width - GAP
          const height = rect.height - GAP
          const percentage = totalMonthly > 0 ? (rect.node.value / totalMonthly) * 100 : 0

          return (
            <div
              key={rect.node.subscription.id}
              style={{
                position: 'absolute',
                transform: `translate3d(${rect.x + GAP / 2}px, ${rect.y + GAP / 2}px, 0)`,
                width: Math.max(0, width),
                height: Math.max(0, height),
              }}
            >
              <BentoTile
                subscription={rect.node.subscription}
                category={getCategory(rect.node.subscription.category_id)}
                colorIndex={rect.node.colorIndex}
                percentage={percentage}
                currency={currency}
                costNormalization={costNormalization}
                convertedAmount={getConvertedAmount(rect.node.subscription)}
                width={width}
                height={height}
                onEdit={onEdit}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
