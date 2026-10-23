import { useState } from 'react'
import { Check } from 'lucide-react'
import { colorName } from '@/lib/constants'
import { readableInkOn } from '@/lib/color'
import { cn } from '@/lib/utils'

interface ColorSwatchesProps {
  colors: readonly string[]
  value: string | null
  onChange: (color: string) => void
  /** Accessible name of the group, e.g. "Color" or "Tag color". */
  label: string
  /** `sm` for inline pickers (28px; still 44px on touch). */
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Preset color picker: named swatches (aria-pressed), the selected one marked with a check.
 * A value outside the presets (a template's brand color, an imported hex) leads the row as a
 * "current" swatch, and stays there after another pick so the user can go back to it.
 */
export function ColorSwatches({
  colors,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: ColorSwatchesProps) {
  const valueIsCustom =
    !!value && !colors.some((preset) => preset.toLowerCase() === value.toLowerCase())
  const [customColor, setCustomColor] = useState(valueIsCustom ? value : null)
  // A new custom value arriving from outside (e.g. a form reset) replaces the remembered one.
  if (valueIsCustom && value.toLowerCase() !== customColor?.toLowerCase()) {
    setCustomColor(value)
  }

  const swatch = (color: string, name: string) => {
    const selected = value?.toLowerCase() === color.toLowerCase()
    return (
      <button
        key={color}
        type="button"
        onClick={() => onChange(color)}
        aria-label={name}
        aria-pressed={selected}
        title={name}
        className={cn(
          'border-border-hover flex items-center justify-center rounded-md border transition-transform duration-150 active:scale-95 pointer-coarse:size-11',
          size === 'sm' ? 'size-7' : 'size-8',
          selected && 'ring-foreground ring-offset-background ring-2 ring-offset-2'
        )}
        style={{ backgroundColor: color, color: readableInkOn(color) }}
      >
        {selected ? <Check className="size-4" aria-hidden="true" /> : null}
      </button>
    )
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {customColor ? (
        <>
          {swatch(customColor, `Current color ${colorName(customColor)}`)}
          <span aria-hidden="true" className="bg-border-hover mx-0.5 h-5 w-px" />
        </>
      ) : null}
      {colors.map((color) => swatch(color, colorName(color)))}
    </div>
  )
}
