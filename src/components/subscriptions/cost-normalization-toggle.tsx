import { useUiStore } from '@/stores/ui-store'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { NORMALIZATION_LABELS } from '@/types/subscription'
import type { NormalizationPeriod } from '@/types/subscription'

const PERIOD_OPTIONS: NormalizationPeriod[] = ['as-is', 'daily', 'weekly', 'monthly', 'yearly']

export function CostNormalizationToggle({ className }: { className?: string }) {
  const costNormalization = useUiStore((s) => s.costNormalization)
  const setCostNormalization = useUiStore((s) => s.setCostNormalization)

  return (
    <Select
      value={costNormalization}
      onValueChange={(v) => setCostNormalization(v as NormalizationPeriod)}
    >
      <SelectTrigger className={cn('justify-start', className)} aria-label="Cost display period">
        <span className="text-muted-foreground shrink-0">Costs</span>
        <SelectValue className="flex-1 text-left" />
      </SelectTrigger>
      <SelectContent>
        {PERIOD_OPTIONS.map((period) => (
          <SelectItem key={period} value={period}>
            {NORMALIZATION_LABELS[period]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
