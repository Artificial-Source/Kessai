import { useState, useEffect, useMemo, useRef, memo } from 'react'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { getLogoDataUrl } from '@/lib/logo-storage'
import { calculateMonthlyAmount, type Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'

interface SubscriptionBentoProps {
  subscriptions: Subscription[]
  categories: Category[]
  currency: CurrencyCode
  onEdit: (subscription: Subscription) => void
}

// Premium color palette
const BENTO_COLORS = [
  '#3b82f6',
  '#4f46e5',
  '#0ea5e9',
  '#06b6d4',
  '#2563eb',
  '#0891b2',
  '#6366f1',
  '#0284c7',
  '#1d4ed8',
  '#0f766e',
  '#1e40af',
  '#334155',
]

const GAP = 3 // Gap between tiles in pixels

interface TreemapNode {
  value: number
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

// Squarify treemap algorithm implementation
function squarify(
  nodes: TreemapNode[],
  container: { x: number; y: number; width: number; height: number }
): TreemapRect[] {
  if (nodes.length === 0) return []

  const totalValue = nodes.reduce((sum, n) => sum + n.value, 0)
  if (totalValue === 0) return []

  const results: TreemapRect[] = []
  let remaining = [...nodes]
  let currentRect = { ...container }

  while (remaining.length > 0) {
    // Prefer vertical layout (items stack top to bottom) by inverting the usual logic
    const isHorizontal = currentRect.width < currentRect.height
    const side = isHorizontal ? currentRect.height : currentRect.width

    // Find optimal row using squarify algorithm
    const row: TreemapNode[] = []
    let rowValue = 0
    const remainingValue = remaining.reduce((sum, n) => sum + n.value, 0)

    for (const node of remaining) {
      const testRow = [...row, node]
      const testRowValue = rowValue + node.value

      if (row.length === 0) {
        row.push(node)
        rowValue = node.value
        continue
      }

      // Calculate aspect ratios
      const currentWorst = worstAspectRatio(row, rowValue, side, remainingValue, currentRect)
      const newWorst = worstAspectRatio(testRow, testRowValue, side, remainingValue, currentRect)

      if (newWorst <= currentWorst) {
        row.push(node)
        rowValue = testRowValue
      } else {
        break
      }
    }

    // Layout the row
    const rowArea = (rowValue / remainingValue) * currentRect.width * currentRect.height
    const rowSize = isHorizontal ? rowArea / currentRect.height : rowArea / currentRect.width

    let offset = 0
    for (const node of row) {
      const nodeSize =
        (node.value / rowValue) * (isHorizontal ? currentRect.height : currentRect.width)

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

    // Update remaining rectangle
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

    // Remove processed nodes
    remaining = remaining.slice(row.length)
  }

  return results
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
    const nodeArea = (node.value / rowValue) * area
    const nodeLength = nodeArea / rowLength
    const aspect = Math.max(rowLength / nodeLength, nodeLength / rowLength)
    worst = Math.max(worst, aspect)
  }

  return worst
}

const BentoTile = memo(function BentoTile({
  subscription,
  category,
  colorIndex,
  percentage,
  currency,
  width,
  height,
  onClick,
}: {
  subscription: Subscription
  category?: Category
  colorIndex: number
  percentage: number
  currency: CurrencyCode
  width: number
  height: number
  onClick: () => void
}) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null)
  const monthlyAmount = calculateMonthlyAmount(subscription.amount, subscription.billing_cycle)
  const bgColor = BENTO_COLORS[colorIndex % BENTO_COLORS.length]

  // Determine tile size for adaptive content
  const isLarge = width > 150 && height > 100
  const isMedium = width > 100 && height > 80
  const isTiny = width < 60 || height < 50

  useEffect(() => {
    if (subscription.logo_url) {
      getLogoDataUrl(subscription.logo_url).then(setLogoSrc)
    }
  }, [subscription.logo_url])

  return (
    <button
      onClick={onClick}
      className="group focus-visible:ring-primary/60 absolute inset-0 overflow-hidden text-left focus:outline-none focus-visible:ring-2"
      style={{ backgroundColor: bgColor, borderRadius: '4px' }}
    >
      {/* Subtle gradient overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)',
        }}
      />

      {/* Content */}
      <div
        className={`relative z-10 flex h-full flex-col justify-between ${
          isLarge ? 'p-4' : isMedium ? 'p-3' : 'p-2'
        }`}
      >
        {/* Top: Logo + Name */}
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0 flex-1">
            <h4
              className={`leading-tight font-semibold text-white ${
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
              <p className="mt-0.5 truncate text-xs text-white/72">{category.name}</p>
            )}
          </div>

          {logoSrc && (
            <img
              src={logoSrc}
              alt=""
              className={`bg-primary-foreground/16 flex-shrink-0 object-contain ${
                isLarge ? 'h-10 w-10 p-1.5' : isMedium ? 'h-7 w-7 p-1' : 'h-5 w-5 p-0.5'
              }`}
              style={{ borderRadius: '3px' }}
            />
          )}
        </div>

        {/* Bottom: Amount + Percentage */}
        {!isTiny && (
          <div className="flex items-end justify-between gap-1">
            <span
              className={`font-semibold text-white ${
                isLarge ? 'text-xl' : isMedium ? 'text-base' : 'text-sm'
              }`}
            >
              {formatCurrency(monthlyAmount, currency)}
            </span>
            <span
              className={`bg-white/20 font-semibold text-white ${
                isLarge ? 'px-1.5 py-0.5 text-xs' : 'px-1 py-0.5 text-[10px]'
              }`}
              style={{ borderRadius: '3px' }}
            >
              {percentage.toFixed(0)}%
            </span>
          </div>
        )}

        {/* For tiny tiles, just show percentage */}
        {isTiny && (
          <span
            className="bg-white/20 px-1 py-0.5 text-[9px] font-semibold text-white"
            style={{ borderRadius: '2px', alignSelf: 'flex-end' }}
          >
            {percentage.toFixed(0)}%
          </span>
        )}
      </div>

      {/* Inactive overlay */}
      {!subscription.is_active && (
        <div className="bg-background/70 absolute inset-0 flex items-center justify-center">
          <span
            className="bg-card/85 text-foreground px-2 py-0.5 text-xs font-medium"
            style={{ borderRadius: '3px' }}
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
  onEdit,
}: SubscriptionBentoProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  // Measure container size with ResizeObserver for reliable dimensions
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        // Use borderBoxSize for accurate dimensions including padding
        const borderBox = entry.borderBoxSize?.[0]
        if (borderBox) {
          setContainerSize({ width: borderBox.inlineSize, height: borderBox.blockSize })
        } else {
          // Fallback to getBoundingClientRect
          const rect = entry.target.getBoundingClientRect()
          setContainerSize({ width: rect.width, height: rect.height })
        }
      }
    })

    resizeObserver.observe(containerRef.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Sort by monthly amount descending
  const sortedSubscriptions = useMemo(() => {
    return [...subscriptions].sort((a, b) => {
      const amountA = calculateMonthlyAmount(a.amount, a.billing_cycle)
      const amountB = calculateMonthlyAmount(b.amount, b.billing_cycle)
      return amountB - amountA
    })
  }, [subscriptions])

  // Calculate total monthly spending
  const totalMonthly = useMemo(() => {
    return subscriptions.reduce(
      (sum, sub) => sum + calculateMonthlyAmount(sub.amount, sub.billing_cycle),
      0
    )
  }, [subscriptions])

  // Calculate treemap layout
  const treemapRects = useMemo((): TreemapRect[] => {
    if (
      containerSize.width === 0 ||
      containerSize.height === 0 ||
      sortedSubscriptions.length === 0
    ) {
      return []
    }

    // Prepare nodes for treemap
    const nodes: TreemapNode[] = sortedSubscriptions.map((sub, index) => ({
      value: calculateMonthlyAmount(sub.amount, sub.billing_cycle),
      subscription: sub,
      colorIndex: index,
    }))

    // Run squarify algorithm
    return squarify(nodes, {
      x: 0,
      y: 0,
      width: containerSize.width,
      height: containerSize.height,
    })
  }, [sortedSubscriptions, containerSize])

  const getCategory = (categoryId: string | null) => {
    if (!categoryId) return undefined
    return categories.find((c) => c.id === categoryId)
  }

  if (subscriptions.length === 0) {
    return (
      <div
        className="border-border/70 flex h-[400px] items-center justify-center rounded-md border border-dashed"
        style={{ borderRadius: '4px' }}
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
        height: 'calc(100vh - 180px)', // Full viewport minus header/filters
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
                transform: `translate(${rect.x + GAP / 2}px, ${rect.y + GAP / 2}px)`,
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
                width={width}
                height={height}
                onClick={() => onEdit(rect.node.subscription)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
