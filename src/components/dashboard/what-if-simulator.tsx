import { memo } from 'react'
import { RotateCcw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { SubscriptionLogo } from '@/components/ui/subscription-logo'
import { useWhatIfSimulator } from '@/hooks/use-what-if-simulator'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_SHORT } from '@/lib/constants'

interface WhatIfSimulatorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currency: CurrencyCode
}

export const WhatIfSimulator = memo(function WhatIfSimulator({
  open,
  onOpenChange,
  currency,
}: WhatIfSimulatorProps) {
  const {
    activeSubscriptions,
    excludedIds,
    currentAnnual,
    simulatedAnnual,
    annualSavings,
    toggleExcluded,
    reset,
  } = useWhatIfSimulator()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">What If...?</DialogTitle>
          <DialogDescription>
            Click subscriptions to toggle them off and see potential savings.
          </DialogDescription>
        </DialogHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Current Annual"
            value={formatCurrency(currentAnnual, currency)}
            className="border-border"
          />
          <SummaryCard
            label="Simulated Annual"
            value={formatCurrency(simulatedAnnual, currency)}
            className="border-primary/30"
          />
          <SummaryCard
            label="Savings"
            value={formatCurrency(annualSavings, currency)}
            className={annualSavings > 0 ? 'border-emerald-500/30' : 'border-border'}
            valueColor={annualSavings > 0 ? 'text-emerald-400' : undefined}
          />
        </div>

        {/* Subscription list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="flex flex-col gap-1.5 py-2">
            {activeSubscriptions.map((sub) => {
              const isExcluded = excludedIds.has(sub.id)
              return (
                <button
                  key={sub.id}
                  onClick={() => toggleExcluded(sub.id)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                    isExcluded ? 'bg-muted/30 opacity-50' : 'hover:bg-muted/50'
                  }`}
                >
                  <SubscriptionLogo
                    logoUrl={sub.logo_url}
                    name={sub.name}
                    color={sub.color}
                    size="sm"
                    className="shrink-0 rounded-md"
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-foreground truncate text-sm font-medium ${
                        isExcluded ? 'line-through' : ''
                      }`}
                    >
                      {sub.name}
                    </p>
                    <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                      {BILLING_CYCLE_SHORT[sub.billing_cycle]}
                      {sub.shared_count > 1 && ` · ${sub.shared_count} people`}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 font-[family-name:var(--font-heading)] text-sm font-semibold ${
                      isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'
                    }`}
                  >
                    {formatCurrency(sub.amount, currency)}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        {excludedIds.size > 0 && (
          <div className="border-border border-t pt-3">
            <Button variant="outline" size="sm" onClick={reset} className="gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              Reset ({excludedIds.size} excluded)
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
})

const SummaryCard = memo(function SummaryCard({
  label,
  value,
  className = '',
  valueColor = 'text-foreground',
}: {
  label: string
  value: string
  className?: string
  valueColor?: string
}) {
  return (
    <div className={`rounded-lg border bg-[var(--color-subtle-overlay)] p-3 ${className}`}>
      <p className="text-muted-foreground mb-1 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
        {label}
      </p>
      <p className={`font-[family-name:var(--font-heading)] text-lg font-bold ${valueColor}`}>
        {value}
      </p>
    </div>
  )
})
