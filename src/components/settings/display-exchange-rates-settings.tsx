import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CurrencyCode } from '@/lib/currency'

interface CurrencyOption {
  value: string
  label: string
}

interface DisplayExchangeRatesSettingsProps {
  mainCurrency: CurrencyCode
  rates: Record<string, number>
  usedCurrencies: CurrencyCode[]
  currencyOptions: CurrencyOption[]
  onSave: (rates: Record<string, number>) => Promise<void>
}

export function DisplayExchangeRatesSettings({
  mainCurrency,
  rates,
  usedCurrencies,
  currencyOptions,
  onSave,
}: DisplayExchangeRatesSettingsProps) {
  const [draftRates, setDraftRates] = useState<Record<string, string>>({})
  const [newCurrency, setNewCurrency] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    setDraftRates(
      Object.fromEntries(
        Object.entries(rates).map(([currency, value]) => [currency, String(value)])
      )
    )
  }, [rates])

  const suggestedCurrencies = useMemo(() => {
    return [...new Set(usedCurrencies)]
      .filter((currency) => currency !== mainCurrency)
      .sort((a, b) => a.localeCompare(b))
  }, [usedCurrencies, mainCurrency])

  const availableOptions = useMemo(() => {
    return currencyOptions.filter(
      (option) => option.value !== mainCurrency && draftRates[option.value] === undefined
    )
  }, [currencyOptions, draftRates, mainCurrency])

  const isDirty = useMemo(() => {
    const normalizedDraft = Object.fromEntries(
      Object.entries(draftRates).flatMap(([currency, value]) => {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) && parsed > 0 ? ([[currency, parsed]] as const) : []
      })
    )

    const currentEntries = Object.entries(rates).sort(([a], [b]) => a.localeCompare(b))
    const draftEntries = Object.entries(normalizedDraft).sort(([a], [b]) => a.localeCompare(b))
    return JSON.stringify(currentEntries) !== JSON.stringify(draftEntries)
  }, [draftRates, rates])

  const handleSave = async () => {
    const normalizedDraft = Object.fromEntries(
      Object.entries(draftRates).flatMap(([currency, value]) => {
        const parsed = Number.parseFloat(value)
        return Number.isFinite(parsed) && parsed > 0 ? ([[currency, parsed]] as const) : []
      })
    )

    setIsSaving(true)
    try {
      await onSave(normalizedDraft)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="border-border flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-widest uppercase">
          Custom Exchange Rates
        </span>
        <p className="text-muted-foreground text-sm">
          Set how each subscription currency converts into `{mainCurrency}` for display.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {Object.keys(draftRates).length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No custom rates yet. Add one for any currency you want to control manually.
          </p>
        ) : null}

        {Object.entries(draftRates)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([currency, value]) => (
            <div key={currency} className="flex items-center gap-2">
              <div className="border-border bg-muted/30 min-w-20 rounded-md border px-3 py-2 text-sm font-medium">
                {currency}
              </div>
              <span className="text-muted-foreground text-xs">to</span>
              <div className="border-border bg-muted/30 min-w-20 rounded-md border px-3 py-2 text-sm font-medium">
                {mainCurrency}
              </div>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={value}
                onChange={(event) =>
                  setDraftRates((current) => ({ ...current, [currency]: event.target.value }))
                }
                placeholder="Rate"
                className="max-w-36"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => {
                  setDraftRates((current) => {
                    const next = { ...current }
                    delete next[currency]
                    return next
                  })
                }}
                aria-label={`Remove ${currency} exchange rate`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={newCurrency} onValueChange={setNewCurrency}>
          <SelectTrigger className="sm:max-w-64">
            <SelectValue placeholder="Add currency" />
          </SelectTrigger>
          <SelectContent>
            {availableOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          disabled={!newCurrency}
          onClick={() => {
            setDraftRates((current) => ({ ...current, [newCurrency]: current[newCurrency] ?? '' }))
            setNewCurrency('')
          }}
        >
          <Plus className="h-4 w-4" />
          Add Rate
        </Button>
      </div>

      {suggestedCurrencies.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          Suggested from your subscriptions: {suggestedCurrencies.join(', ')}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">
          Use `1 source currency = ? {mainCurrency}` style rates.
        </p>
        <Button type="button" onClick={() => void handleSave()} disabled={!isDirty || isSaving}>
          {isSaving ? 'Saving...' : 'Save Rates'}
        </Button>
      </div>
    </div>
  )
}
