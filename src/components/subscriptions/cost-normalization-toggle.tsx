import { useUiStore } from '@/stores/ui-store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NORMALIZATION_LABELS } from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'

const PERIOD_OPTIONS: NormalizationPeriod[] = ['as-is', 'daily', 'weekly', 'monthly', 'yearly']

export function CostNormalizationToggle() {
  const costNormalization = useUiStore((s) => s.costNormalization)
  const setCostNormalization = useUiStore((s) => s.setCostNormalization)

  return (
    <Select
      value={costNormalization}
      onValueChange={(v) => setCostNormalization(v as NormalizationPeriod)}
    >
      <SelectTrigger className="h-10 w-full gap-2 rounded-lg font-[family-name:var(--font-mono)] text-[11px] tracking-wider sm:w-[160px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIOD_OPTIONS.map((period) => (
          <SelectItem
            key={period}
            value={period}
            className="font-[family-name:var(--font-mono)] text-[11px] tracking-wider"
          >
            {NORMALIZATION_LABELS[period]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
