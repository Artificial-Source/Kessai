import { useState, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Upload, FileText, AlertCircle, Check, ChevronDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  parseCSV,
  detectAndParseJSON,
  readFileAsText,
  getCSVHeaders,
  type ParseResult,
} from '@/lib/import-parsers'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import type { BillingCycle } from '@/types/subscription'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDataChanged: () => void
}

type ImportStep = 'upload' | 'mapping' | 'preview'
type DuplicateMode = 'skip' | 'rename'

const MAPPABLE_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'billing_cycle', label: 'Billing Cycle', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'start_date', label: 'Start Date', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const

export function ImportDialog({ open, onOpenChange, onDataChanged }: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvContent, setCsvContent] = useState<string>('')
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { subscriptions, add: addSubscription } = useSubscriptionStore()
  const { categories } = useCategoryStore()
  const { settings } = useSettingsStore()
  const currency = (settings?.currency || 'USD') as CurrencyCode

  const existingNames = useMemo(
    () => new Set(subscriptions.map((s) => s.name.toLowerCase())),
    [subscriptions]
  )

  const resetState = () => {
    setStep('upload')
    setParseResult(null)
    setCsvHeaders([])
    setCsvContent('')
    setColumnMapping({})
    setSelectedRows(new Set())
    setIsImporting(false)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const content = await readFileAsText(file)
      const isCSV = file.name.endsWith('.csv')

      if (isCSV) {
        const headers = getCSVHeaders(content)
        setCsvHeaders(headers)
        setCsvContent(content)

        // Try auto-mapping first
        const autoResult = parseCSV(content)
        if (autoResult.subscriptions.length > 0) {
          setParseResult(autoResult)
          setSelectedRows(new Set(autoResult.subscriptions.map((_, i) => i)))
          setStep('preview')
        } else {
          // Need manual mapping
          setStep('mapping')
        }
      } else {
        // JSON file
        const data = JSON.parse(content)
        const result = detectAndParseJSON(data)

        if (result.subscriptions.length === 0 && result.errors.length > 0) {
          toast.error(result.errors[0])
          return
        }

        setParseResult(result)
        setSelectedRows(new Set(result.subscriptions.map((_, i) => i)))
        setStep('preview')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to read file')
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleMappingComplete = () => {
    if (columnMapping.name === undefined || columnMapping.amount === undefined) {
      toast.error('Name and Amount columns are required')
      return
    }

    const result = parseCSV(csvContent, columnMapping)
    if (result.subscriptions.length === 0) {
      toast.error('No valid subscriptions found with this mapping')
      return
    }

    setParseResult(result)
    setSelectedRows(new Set(result.subscriptions.map((_, i) => i)))
    setStep('preview')
  }

  const handleImport = async () => {
    if (!parseResult) return

    const toImport = parseResult.subscriptions.filter((_, i) => selectedRows.has(i))
    if (toImport.length === 0) {
      toast.error('No subscriptions selected for import')
      return
    }

    setIsImporting(true)
    let imported = 0
    let skipped = 0

    for (const sub of toImport) {
      const isDuplicate = existingNames.has(sub.name.toLowerCase())

      if (isDuplicate && duplicateMode === 'skip') {
        skipped++
        continue
      }

      const name = isDuplicate && duplicateMode === 'rename' ? `${sub.name} (imported)` : sub.name

      // Try to match category by name
      let categoryId: string | null = null
      if (sub.category_name) {
        const matched = categories.find(
          (c) => c.name.toLowerCase() === sub.category_name!.toLowerCase()
        )
        if (matched) {
          categoryId = matched.id
        }
      }

      try {
        await addSubscription({
          name,
          amount: sub.amount,
          currency: sub.currency || currency,
          billing_cycle: sub.billing_cycle,
          billing_day: null,
          category_id: categoryId,
          color: null,
          notes: sub.notes ?? null,
          is_active: true,
          status: 'active',
          shared_count: 1,
          next_payment_date: sub.start_date || new Date().toISOString().split('T')[0],
        })
        imported++
      } catch (error) {
        console.error(`Failed to import "${sub.name}":`, error)
      }
    }

    setIsImporting(false)

    const parts = [`Imported ${imported} subscription${imported !== 1 ? 's' : ''}`]
    if (skipped > 0) {
      parts.push(`${skipped} skipped (duplicates)`)
    }

    toast.success(parts.join(', '))
    onDataChanged()
    onOpenChange(false)
    resetState()
  }

  const handleClose = (open: boolean) => {
    if (!open) resetState()
    onOpenChange(open)
  }

  const toggleRow = (index: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const toggleAll = () => {
    if (!parseResult) return
    if (selectedRows.size === parseResult.subscriptions.length) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(parseResult.subscriptions.map((_, i) => i)))
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-heading)] text-xl">
            Import Subscriptions
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Import subscriptions from a CSV or JSON file.'}
            {step === 'mapping' && 'Map your CSV columns to subscription fields.'}
            {step === 'preview' && 'Review and select subscriptions to import.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {step === 'upload' && (
            <UploadStep fileInputRef={fileInputRef} onFileSelect={handleFileSelect} />
          )}

          {step === 'mapping' && (
            <MappingStep
              headers={csvHeaders}
              mapping={columnMapping}
              onMappingChange={setColumnMapping}
              onComplete={handleMappingComplete}
              onBack={() => setStep('upload')}
            />
          )}

          {step === 'preview' && parseResult && (
            <PreviewStep
              result={parseResult}
              selectedRows={selectedRows}
              duplicateMode={duplicateMode}
              existingNames={existingNames}
              currency={currency}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onDuplicateModeChange={setDuplicateMode}
            />
          )}
        </div>

        {step === 'preview' && parseResult && (
          <DialogFooter className="border-border flex-shrink-0 border-t pt-4">
            <div className="flex w-full flex-col items-center justify-between gap-2 sm:flex-row">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedRows.size === 0}
                className="gap-2"
              >
                <Upload className="h-4 w-4" />
                {isImporting
                  ? 'Importing...'
                  : `Import ${selectedRows.size} subscription${selectedRows.size !== 1 ? 's' : ''}`}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Upload Step ────────────────────────────────────────────────────────

function UploadStep({
  fileInputRef,
  onFileSelect,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
}) {
  return (
    <div className="flex flex-col gap-6 py-4">
      <button
        onClick={() => fileInputRef.current?.click()}
        className="border-border hover:border-primary/50 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors"
      >
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <Upload className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-foreground text-sm font-medium">Click to select a file</p>
          <p className="text-muted-foreground mt-1 text-xs">Supports CSV and JSON files</p>
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.json"
        onChange={onFileSelect}
        className="hidden"
      />

      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          Supported Formats
        </p>
        <div className="flex flex-col gap-2">
          <FormatInfo
            icon={<FileText className="h-4 w-4" />}
            title="Generic CSV"
            description="Columns: name, amount, currency, billing_cycle, category, start_date"
          />
          <FormatInfo
            icon={<FileText className="h-4 w-4" />}
            title="Subby JSON Backup"
            description="Exported from Subby's data management settings"
          />
          <FormatInfo
            icon={<FileText className="h-4 w-4" />}
            title="Wallos JSON"
            description="Exported from the Wallos subscription tracker"
          />
        </div>
      </div>
    </div>
  )
}

function FormatInfo({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="border-border flex items-start gap-3 rounded-lg border bg-[var(--color-subtle-overlay)] px-3 py-2.5">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div>
        <p className="text-foreground text-xs font-medium">{title}</p>
        <p className="text-muted-foreground text-[11px]">{description}</p>
      </div>
    </div>
  )
}

// ── Mapping Step ───────────────────────────────────────────────────────

function MappingStep({
  headers,
  mapping,
  onMappingChange,
  onComplete,
  onBack,
}: {
  headers: string[]
  mapping: Record<string, number>
  onMappingChange: (mapping: Record<string, number>) => void
  onComplete: () => void
  onBack: () => void
}) {
  const updateMapping = (field: string, columnIndex: number | undefined) => {
    const next = { ...mapping }
    if (columnIndex === undefined) {
      delete next[field]
    } else {
      next[field] = columnIndex
    }
    onMappingChange(next)
  }

  return (
    <div className="flex flex-col gap-5 py-4">
      <div className="border-border rounded-lg border bg-[var(--color-subtle-overlay)] p-3">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-muted-foreground text-xs">
            We couldn't auto-detect your CSV columns. Please map them manually below.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {MAPPABLE_FIELDS.map((field) => (
          <div
            key={field.key}
            className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center sm:gap-4"
          >
            <label className="text-foreground text-sm sm:min-w-[100px]">
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </label>
            <div className="relative flex-1">
              <select
                value={mapping[field.key] ?? ''}
                onChange={(e) => {
                  const val = e.target.value
                  updateMapping(field.key, val === '' ? undefined : parseInt(val, 10))
                }}
                className="border-border bg-input text-foreground focus:border-primary focus:ring-primary h-9 w-full appearance-none rounded-lg border pr-8 pl-3 font-[family-name:var(--font-mono)] text-xs focus:ring-1 focus:outline-none"
              >
                <option value="">-- Not mapped --</option>
                {headers.map((header, i) => (
                  <option key={`col-${header}-${i}`} value={i}>
                    {header}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button
          onClick={onComplete}
          disabled={mapping.name === undefined || mapping.amount === undefined}
        >
          Preview Import
        </Button>
      </div>
    </div>
  )
}

// ── Preview Step ───────────────────────────────────────────────────────

function PreviewStep({
  result,
  selectedRows,
  duplicateMode,
  existingNames,
  currency,
  onToggleRow,
  onToggleAll,
  onDuplicateModeChange,
}: {
  result: ParseResult
  selectedRows: Set<number>
  duplicateMode: DuplicateMode
  existingNames: Set<string>
  currency: CurrencyCode
  onToggleRow: (index: number) => void
  onToggleAll: () => void
  onDuplicateModeChange: (mode: DuplicateMode) => void
}) {
  const duplicateCount = result.subscriptions.filter((s) =>
    existingNames.has(s.name.toLowerCase())
  ).length

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Source badge */}
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          Source
        </span>
        <span className="bg-primary/10 text-primary rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider uppercase">
          {result.source === 'csv' && 'CSV'}
          {result.source === 'subby-json' && 'Subby Backup'}
          {result.source === 'wallos-json' && 'Wallos'}
        </span>
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-1 text-xs font-medium text-amber-400">
            {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
          </p>
          <div className="max-h-20 overflow-y-auto">
            {result.errors.slice(0, 5).map((err, i) => (
              <p
                key={`error-${i}-${err.slice(0, 20)}`}
                className="text-muted-foreground text-[11px]"
              >
                {err}
              </p>
            ))}
            {result.errors.length > 5 && (
              <p className="text-muted-foreground text-[11px]">
                ...and {result.errors.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {/* Duplicate handling */}
      {duplicateCount > 0 && (
        <div className="border-border rounded-lg border bg-[var(--color-subtle-overlay)] p-3">
          <p className="text-foreground mb-2 text-xs font-medium">
            {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''} found
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onDuplicateModeChange('skip')}
              className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider uppercase transition-colors ${
                duplicateMode === 'skip'
                  ? 'bg-primary/20 text-primary border-primary/30 border'
                  : 'text-muted-foreground border-border hover:text-foreground border'
              }`}
            >
              Skip duplicates
            </button>
            <button
              onClick={() => onDuplicateModeChange('rename')}
              className={`rounded-lg px-3 py-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider uppercase transition-colors ${
                duplicateMode === 'rename'
                  ? 'bg-primary/20 text-primary border-primary/30 border'
                  : 'text-muted-foreground border-border hover:text-foreground border'
              }`}
            >
              Rename & import
            </button>
          </div>
        </div>
      )}

      {/* Subscription table */}
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[500px]">
            <thead>
              <tr className="border-border border-b bg-[var(--color-subtle-overlay)]">
                <th className="w-10 px-3 py-2.5">
                  <button
                    onClick={onToggleAll}
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      selectedRows.size === result.subscriptions.length
                        ? 'border-primary bg-primary'
                        : 'border-border hover:border-foreground'
                    }`}
                  >
                    {selectedRows.size === result.subscriptions.length && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </button>
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                  Name
                </th>
                <th className="text-muted-foreground px-3 py-2.5 text-right font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase">
                  Amount
                </th>
                <th className="text-muted-foreground hidden px-3 py-2.5 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase sm:table-cell">
                  Cycle
                </th>
                <th className="text-muted-foreground hidden px-3 py-2.5 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase md:table-cell">
                  Category
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {result.subscriptions.map((sub, i) => {
                const isDuplicate = existingNames.has(sub.name.toLowerCase())
                const isSelected = selectedRows.has(i)

                return (
                  <tr
                    key={`sub-${i}-${sub.name}`}
                    className={`transition-colors ${
                      isSelected ? 'bg-[var(--color-subtle-overlay)]' : 'opacity-40'
                    } ${isDuplicate ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => onToggleRow(i)}
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-border hover:border-foreground'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm">{sub.name}</span>
                        {isDuplicate && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9px] tracking-wider text-amber-400 uppercase">
                            Duplicate
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-foreground font-[family-name:var(--font-mono)] text-xs font-semibold">
                        {formatCurrency(sub.amount, (sub.currency as CurrencyCode) || currency)}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 sm:table-cell">
                      <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
                        {BILLING_CYCLE_LABELS[sub.billing_cycle as BillingCycle] ||
                          sub.billing_cycle}
                      </span>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <span className="text-muted-foreground text-xs">
                        {sub.category_name || '-'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
