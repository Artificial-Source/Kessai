import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, describe, it } from 'vitest'

const globalsCss = resolve(process.cwd(), 'src/styles/globals.css')
const calendarDayPanel = resolve(process.cwd(), 'src/components/calendar/calendar-day-panel.tsx')
const spendingTrends = resolve(process.cwd(), 'src/components/dashboard/spending-trends.tsx')
const monthlySpendingChart = resolve(
  process.cwd(),
  'src/components/analytics/monthly-spending-chart.tsx'
)
const dashboardPage = resolve(process.cwd(), 'src/pages/dashboard.tsx')
const subscriptionsPage = resolve(process.cwd(), 'src/pages/subscriptions.tsx')
const bottomTabBar = resolve(process.cwd(), 'src/components/layout/bottom-tab-bar.tsx')

function extractUtilityBlock(css: string, utilityName: string) {
  const marker = `@utility ${utilityName}`
  const start = css.indexOf(marker)

  if (start === -1) {
    return null
  }

  const blockStart = css.indexOf('{', start)

  if (blockStart === -1) {
    return null
  }

  let depth = 0

  for (let index = blockStart; index < css.length; index += 1) {
    if (css[index] === '{') {
      depth += 1
    } else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) {
        return css.slice(start, index + 1)
      }
    }
  }

  return null
}

describe('global blur policy', () => {
  it('keeps glass-card blur-free while glass-overlay preserves blur', () => {
    const css = readFileSync(globalsCss, 'utf8')

    const glassCardBlock = extractUtilityBlock(css, 'glass-card')
    const glassOverlayBlock = extractUtilityBlock(css, 'glass-overlay')

    expect(glassCardBlock).not.toBeNull()
    expect(glassOverlayBlock).not.toBeNull()

    expect(glassCardBlock).not.toMatch(/backdrop-filter:\s*blur\([^)]*\)/i)
    expect(glassOverlayBlock).toMatch(/backdrop-filter:\s*blur\([^)]*\)/i)
  })

  it('keeps blur off known scrolling surfaces and uses glass-overlay for preserved overlays', () => {
    const overlayComponents = [calendarDayPanel, spendingTrends, monthlySpendingChart].map((file) =>
      readFileSync(file, 'utf8')
    )
    const scrollSurfaceComponents = [dashboardPage, subscriptionsPage, bottomTabBar].map((file) =>
      readFileSync(file, 'utf8')
    )

    expect(overlayComponents[0]).toMatch(/className="[^"]*glass-overlay[^"]*animate-slide-in-right/)
    expect(overlayComponents[1]).toMatch(/className="[^"]*glass-overlay[^"]*shadow-lg[^"]*"/)
    expect(overlayComponents[2]).toMatch(/className="[^"]*glass-overlay[^"]*shadow-lg[^"]*"/)

    for (const component of overlayComponents) {
      expect(component).not.toMatch(/backdrop-blur\b/)
      expect(component).not.toMatch(/backdropFilter/)
      expect(component).not.toMatch(/backdrop-filter/)
      expect(component).not.toMatch(/WebkitBackdropFilter/)
      expect(component).not.toMatch(/-webkit-backdrop-filter/)
    }

    for (const component of scrollSurfaceComponents) {
      expect(component).not.toMatch(/backdrop-blur\b/)
      expect(component).not.toMatch(/glass-overlay/)
      expect(component).not.toMatch(/backdropFilter/)
      expect(component).not.toMatch(/backdrop-filter/)
      expect(component).not.toMatch(/WebkitBackdropFilter/)
      expect(component).not.toMatch(/-webkit-backdrop-filter/)
    }
  })
})
