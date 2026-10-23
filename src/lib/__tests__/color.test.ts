import { describe, expect, it } from 'vitest'
import { readableInkOn } from '../color'

const WHITE = '#ffffff'
const INK = '#131313'

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

describe('readableInkOn', () => {
  it.each([
    // Teal: white is only 2.49:1; near-black reads at 7.45:1.
    { tile: '#14b8a6', ink: INK },
    // Pure red sits near the crossover: near-black 4.64:1 beats white 4.00:1.
    { tile: '#ff0000', ink: INK },
    // Linear indigo: white 4.70:1 beats near-black 3.95:1.
    { tile: '#5e6ad2', ink: WHITE },
    { tile: '#ffffff', ink: INK },
    { tile: '#000000', ink: WHITE },
  ])('picks $ink on $tile, the ink with the higher contrast ratio', ({ tile, ink }) => {
    const chosen = readableInkOn(tile)
    const other = chosen === WHITE ? INK : WHITE

    expect(chosen).toBe(ink)
    expect(contrast(chosen, tile)).toBeGreaterThan(contrast(other, tile))
  })

  it('accepts shorthand and uppercase hex', () => {
    expect(readableInkOn('#FFF')).toBe(INK)
    expect(readableInkOn('14B8A6')).toBe(INK)
  })

  it('falls back to white for values it cannot parse', () => {
    expect(readableInkOn('var(--color-surface-highest)')).toBe(WHITE)
  })
})
