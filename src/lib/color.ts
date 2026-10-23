/** White or near-black, whichever reads better on a brand color (hex). */
export function readableInkOn(background: string): string {
  const hex = background.trim().replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return '#ffffff'
  const channel = (offset: number) => {
    const v = parseInt(full.slice(offset, offset + 2), 16) / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4)
  const onWhite = 1.05 / (luminance + 0.05)
  const onInk = (luminance + 0.05) / 0.0566
  return onWhite >= onInk ? '#ffffff' : '#131313'
}
