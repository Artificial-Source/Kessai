import { useState, useEffect, useMemo, useRef, memo } from 'react'
import { Pin } from 'lucide-react'
import { formatAmount, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'
import { calculateDisplayTotals } from '@/lib/totals'
import { cn } from '@/lib/utils'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { StatusBadge } from '@/components/subscriptions/status-badge'
import { subscriptionDisplayStatus } from '@/components/subscriptions/subscription-display'
import {
  calculateNormalizedAmount,
  calculateUserMonthlyAmount,
  compareSubscriptionDisplayPriority,
  isBillableStatus,
  NORMALIZATION_SUFFIXES,
  STATUS_LABELS,
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
/** Tiles shallower than this show only a logo, so the layout never leaves a strip thinner. */
const MIN_STRIP = 60

/**
 * Measured metrics (px) of the tile type, used only to decide which optional lines fit a tile:
 * advance width per character and line height. Names truncate in CSS; amounts never do.
 */
const TYPE = {
  amountLarge: { char: 11, line: 28 },
  amountSmall: { char: 7.7, line: 20 },
  nameLarge: { char: 9.7, line: 20 },
  nameSmall: { char: 8.5, line: 17.5 },
  label: { char: 7.6, line: 15 },
  caption: { char: 6.2, line: 16 },
  /** A status badge: label text plus dot, padding and edge. */
  badge: { extra: 26, line: 20 },
} as const
/** Large tiles pair up to two name lines with a 40px logo; the category adds 18px. */
const LARGE_LOGO = 40
const CATEGORY_LINE = 18
const SMALL_LOGO = 20
/** Below this inner width a name shows only a few letters, so the logo stands in for it. */
const MIN_NAME_WIDTH = 64
/**
 * Space between the name and money groups. Money (amount, percentage or status, share) may
 * pack down to the minimum; the second name line, logo and category only show with room left.
 */
const MIN_GAP = 4
const COMFORT_GAP = 8

interface TreemapNode {
  /** The user's monthly share; only comparable within the display currency. */
  monthlyShare: number
  layoutValue: number
  /** Counted in the header total: billable and in the display currency. */
  inTotal: boolean
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

    // The nodes after this row share a strip as deep as the space left over. When that strip
    // would be too shallow for a readable tile (paused and other-currency tiles sort last, so
    // they would land in it), this row takes them in instead.
    const depth = (currentRect.width * currentRect.height) / side
    if (row.length < remaining.length && depth * (1 - rowValue / remainingValue) < MIN_STRIP) {
      row.push(...remaining.slice(row.length))
      rowValue = remainingValue
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
  if (percentage < 0.1) return '<0.1%'
  if (percentage < 1) return `${percentage.toFixed(1)}%`
  return `${Math.round(percentage)}%`
}

interface TileText {
  name: string
  pinned: boolean
  amount: string
  suffix: string
  /** The user's part of a split charge, or null when unshared. */
  share: string | null
  /** Corner text: a percentage, a currency code, or a status badge label. */
  meta: string
  metaIsBadge: boolean
}

interface TilePlan {
  /** tiny: logo only. compact: name (or logo) over the money. large: bigger type, logo, category. */
  layout: 'tiny' | 'compact' | 'large'
  padding: number
  /** False on narrow compact tiles, where a small logo stands in for the name. */
  showName: boolean
  nameLines: 1 | 2
  /** The 40px logo beside the name on large tiles. */
  showLogo: boolean
  showMeta: boolean
  /** "Your share $34.50" on large tiles, "$34.50 share" on compact ones; null when not shown. */
  shareCaption: string | null
  showCategory: boolean
}

const TINY_TILE: TilePlan = {
  layout: 'tiny',
  padding: 4,
  showName: false,
  nameLines: 1,
  showLogo: false,
  showMeta: false,
  shareCaption: null,
  showCategory: false,
}

/**
 * The name and amount always show; a tile too small for both shows only the logo. Optional
 * parts are added in priority order while they fit: the corner percentage or status, the
 * user's share, a second name line (with the logo on large tiles), then the category.
 * Whatever is left out stays in the tile's accessible name.
 */
function planTile(width: number, height: number, text: TileText, hasCategory: boolean): TilePlan {
  if (width < 60 || height < 50) return TINY_TILE

  // A large tile needs room for its big figure inside 16px padding and the 1px border;
  // a long amount in another currency lays out as a compact tile instead.
  const isLarge =
    width > 150 && height > 100 && text.amount.length * TYPE.amountLarge.char <= width - 34
  const padding = isLarge ? 16 : width > 100 && height > 80 ? 12 : 8
  // Inside the padding and the 1px border.
  const innerWidth = width - padding * 2 - 2
  const innerHeight = height - padding * 2 - 2
  const showName = isLarge || innerWidth >= MIN_NAME_WIDTH
  const nameLine = isLarge ? TYPE.nameLarge.line : TYPE.nameSmall.line
  const amountType = isLarge ? TYPE.amountLarge : TYPE.amountSmall
  const figureWidth = text.amount.length * amountType.char
  const amountWidth = figureWidth + (text.suffix ? 4 + text.suffix.length * TYPE.label.char : 0)
  // A suffix that does not fit beside the amount wraps under it.
  const amountHeight =
    amountWidth <= innerWidth ? amountType.line : amountType.line + TYPE.label.line
  const metaWidth = text.meta.length * TYPE.label.char + (text.metaIsBadge ? TYPE.badge.extra : 0)
  const metaHeight = text.metaIsBadge ? TYPE.badge.line : TYPE.label.line
  const shareCaption =
    text.share === null ? null : isLarge ? `Your share ${text.share}` : `${text.share} share`
  const shareWidth = shareCaption ? shareCaption.length * TYPE.caption.char : 0

  const fits = (top: number, meta: boolean, share: boolean, gap: number) => {
    if (meta && metaWidth > innerWidth) return false
    if (share && shareWidth > innerWidth) return false
    const moneyWidth = Math.max(Math.min(amountWidth, innerWidth), share ? shareWidth : 0)
    const metaWraps = meta && moneyWidth + 8 + metaWidth > innerWidth
    const bottom = amountHeight + (share ? TYPE.caption.line : 0) + (metaWraps ? metaHeight + 4 : 0)
    return top + gap + bottom <= innerHeight
  }

  const top = showName ? nameLine : SMALL_LOGO
  // Amounts are never cut: a tile that cannot hold the figure shows only the logo.
  if (figureWidth > innerWidth || !fits(top, false, false, MIN_GAP)) return TINY_TILE
  const showMeta = fits(top, true, false, MIN_GAP)
  const showShare = shareCaption !== null && fits(top, showMeta, true, MIN_GAP)
  // Two name lines and the large logo are the same height, so they come and go together.
  const tallTop = isLarge ? LARGE_LOGO : nameLine * 2
  const isRoomy = showName && fits(tallTop, showMeta, showShare, COMFORT_GAP)
  // A second line only helps a name that breaks between words: a single word too long for
  // the line beside the pin (and logo) keeps one line and ends in an ellipsis.
  const showLogo = isLarge && isRoomy
  const besideName =
    (text.pinned ? 14 : 0) + (showLogo ? LARGE_LOGO : 0) + (text.pinned && showLogo ? 6 : 0)
  const nameWidth = innerWidth - (besideName > 0 ? besideName + 8 : 0)
  const longestWord = Math.max(...text.name.split(/\s+/).map((word) => word.length))
  const wordsFit = longestWord * (isLarge ? TYPE.nameLarge.char : TYPE.nameSmall.char) <= nameWidth
  return {
    layout: isLarge ? 'large' : 'compact',
    padding,
    showName,
    nameLines: isRoomy && wordsFit ? 2 : 1,
    showLogo,
    showMeta,
    shareCaption: showShare ? shareCaption : null,
    showCategory:
      isLarge &&
      isRoomy &&
      hasCategory &&
      fits(tallTop + CATEGORY_LINE, showMeta, showShare, COMFORT_GAP),
  }
}

const BentoTile = memo(function BentoTile({
  subscription,
  category,
  colorIndex,
  percentage,
  currency,
  costNormalization,
  width,
  height,
  onEdit,
}: {
  subscription: Subscription
  category?: Category
  colorIndex: number
  /** Share of the display-currency total; null when the subscription is not counted in it. */
  percentage: number | null
  currency: CurrencyCode
  costNormalization: NormalizationPeriod
  width: number
  height: number
  onEdit: (subscription: Subscription) => void
}) {
  const subCurrency = (subscription.currency || currency) as CurrencyCode
  const status = subscriptionDisplayStatus(subscription)
  const isBillable = isBillableStatus(status)

  // The full charge, as every view shows it; the user's share sits under it when split.
  const isNormalized = costNormalization !== 'as-is'
  const amount = isNormalized
    ? calculateNormalizedAmount(subscription.amount, subscription.billing_cycle, costNormalization)
    : subscription.amount
  const suffix =
    amount === 0
      ? ''
      : isNormalized
        ? NORMALIZATION_SUFFIXES[costNormalization]
        : BILLING_CYCLE_SHORT[subscription.billing_cycle]
  const amountText = formatAmount(amount, subCurrency)
  const shareText =
    subscription.shared_count > 1 && amount !== 0
      ? formatAmount(amount / subscription.shared_count, subCurrency)
      : null
  const percentText = percentage === null ? null : formatPercentage(percentage)
  const meta = !isBillable ? STATUS_LABELS[status] : (percentText ?? subCurrency)

  const plan = planTile(
    width,
    height,
    {
      name: subscription.name,
      pinned: subscription.is_pinned,
      amount: amountText,
      suffix,
      share: shareText,
      meta,
      metaIsBadge: !isBillable,
    },
    Boolean(category)
  )
  const isLarge = plan.layout === 'large'

  const label = [
    `Edit ${subscription.name}`,
    `${amountText}${suffix}`,
    shareText && `your share ${shareText}`,
    !isBillable
      ? `${STATUS_LABELS[status].toLowerCase()}, not in the ${currency} total`
      : percentText
        ? `${percentText} of the ${currency} total`
        : `in ${subCurrency}, not in the ${currency} total`,
    subscription.is_pinned && 'pinned',
  ]
    .filter(Boolean)
    .join(', ')

  const logo = (size: 'sm' | 'md', className: string) => (
    <SubscriptionLogo
      logoUrl={subscription.logo_url}
      name={subscription.name}
      color={subscription.color || category?.color}
      size={size}
      decorative
      dimmed={!subscription.is_active}
      className={className}
    />
  )

  return (
    <button
      type="button"
      onClick={() => onEdit(subscription)}
      aria-label={label}
      title={subscription.name}
      className="border-border hover:border-border-hover absolute inset-0 flex flex-col justify-between gap-1 overflow-hidden rounded-sm border text-left transition-colors duration-150 focus-visible:outline-offset-[-2px]"
      style={{
        backgroundColor: BENTO_COLORS[colorIndex % BENTO_COLORS.length],
        padding: plan.padding,
      }}
    >
      {plan.layout === 'tiny' ? (
        logo('sm', 'm-auto rounded-sm')
      ) : (
        <>
          {/* Clips rather than overprints the money if the plan ever misjudges the space. */}
          <div className="flex min-h-0 min-w-0 items-start justify-between gap-2 overflow-hidden">
            {plan.showName ? (
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-foreground font-bold',
                    // The size utility carries its own line height; the leading must follow it.
                    isLarge ? 'text-base leading-tight' : 'text-sm leading-tight',
                    plan.nameLines === 2 ? 'line-clamp-2 break-words' : 'truncate'
                  )}
                >
                  {subscription.name}
                </p>
                {plan.showCategory && category && (
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">{category.name}</p>
                )}
              </div>
            ) : (
              logo('sm', 'shrink-0 rounded-sm')
            )}
            {(subscription.is_pinned || plan.showLogo) && (
              <div className="flex shrink-0 items-center gap-1.5">
                {subscription.is_pinned && (
                  <Pin aria-hidden="true" className="text-foreground size-3.5 fill-current" />
                )}
                {plan.showLogo && logo('md', 'rounded-md')}
              </div>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-2 gap-y-1">
            <div className="flex min-w-0 flex-col">
              <p className="flex flex-wrap items-baseline gap-x-1">
                <span
                  className={cn(
                    'text-foreground font-bold tracking-tight tabular-nums',
                    isLarge ? 'text-xl' : 'text-sm'
                  )}
                >
                  {amountText}
                </span>
                {suffix && <span className="type-label text-muted-foreground">{suffix}</span>}
              </p>
              {plan.shareCaption && (
                <p className="text-muted-foreground text-xs tabular-nums">{plan.shareCaption}</p>
              )}
            </div>
            {plan.showMeta && (
              // Right-aligned even when it wraps under the money.
              <span className="ml-auto flex">
                {isBillable ? (
                  <span className="type-label text-muted-foreground">{meta}</span>
                ) : (
                  <StatusBadge status={status} />
                )}
              </span>
            )}
          </div>
        </>
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

  // Tiles are sized by the user's monthly share, and shares count against the header's total:
  // billable subscriptions in the display currency. Other currencies are never converted, so
  // they get a neutral (median) tile and no share; paused or cancelling subscriptions keep
  // their size but have no share.
  const { nodes, totalMonthly } = useMemo(() => {
    const entries = subscriptions.map((sub) => ({
      sub,
      monthlyShare: calculateUserMonthlyAmount(sub.amount, sub.billing_cycle, sub.shared_count),
      comparable: sub.currency === currency,
    }))
    const layoutOf = (monthly: number) => Math.sqrt(Math.max(monthly, 0) + MIN_LAYOUT_VALUE)
    const sortedLayouts = entries
      .filter((entry) => entry.comparable)
      .map((entry) => layoutOf(entry.monthlyShare))
      .sort((a, b) => a - b)
    const neutralLayout =
      sortedLayouts.length > 0 ? sortedLayouts[Math.floor(sortedLayouts.length / 2)] : layoutOf(0)

    const ordered = [...entries].sort((a, b) => {
      const priority = compareSubscriptionDisplayPriority(a.sub, b.sub)
      if (priority !== 0) return priority
      if (a.comparable !== b.comparable) return a.comparable ? -1 : 1
      return b.monthlyShare - a.monthlyShare
    })

    return {
      totalMonthly: calculateDisplayTotals(subscriptions, currency).monthly,
      nodes: ordered.map<TreemapNode>((entry, index) => ({
        monthlyShare: entry.monthlyShare,
        layoutValue: entry.comparable ? layoutOf(entry.monthlyShare) : neutralLayout,
        inTotal: entry.comparable && isBillableStatus(subscriptionDisplayStatus(entry.sub)),
        subscription: entry.sub,
        colorIndex: index,
      })),
    }
  }, [subscriptions, currency])

  const treemapRects = useMemo((): TreemapRect[] => {
    if (containerSize.width === 0 || containerSize.height === 0) return []
    return squarify(nodes, {
      x: 0,
      y: 0,
      width: containerSize.width,
      height: containerSize.height,
    })
  }, [nodes, containerSize])

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  )

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{
        height: 'clamp(420px, calc(100dvh - 220px), 720px)',
        contain: 'layout style',
      }}
    >
      <ul className="absolute inset-0" style={{ contain: 'strict' }}>
        {treemapRects.map((rect) => {
          const width = rect.width - GAP
          const height = rect.height - GAP
          const percentage = !rect.node.inTotal
            ? null
            : totalMonthly > 0
              ? (rect.node.monthlyShare / totalMonthly) * 100
              : 0

          return (
            <li
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
                category={
                  rect.node.subscription.category_id
                    ? categoryById.get(rect.node.subscription.category_id)
                    : undefined
                }
                colorIndex={rect.node.colorIndex}
                percentage={percentage}
                currency={currency}
                costNormalization={costNormalization}
                width={width}
                height={height}
                onEdit={onEdit}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}
