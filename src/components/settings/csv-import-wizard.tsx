import { useState, useRef, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  Check,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  Loader2,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import type { BillingCycle } from '@/types/subscription'
import {
  parseCSVFile,
  autoDetectColumnMapping,
  detectRecurringCharges,
  type CSVParseResult,
  type ColumnMapping,
  type DetectedSubscription,
} from '@/lib/csv-import'

interface CSVImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDataChanged: () => void
}

type WizardStep = 'upload' | 'mapping' | 'review' | 'results'

const FIELD_OPTIONS = [
  { key: 'name' as const, label: 'Name', required: true },
  { key: 'amount' as const, label: 'Amount', required: true },
  { key: 'currency' as const, label: 'Currency', required: false },
  { key: 'billing_cycle' as const, label: 'Billing Cycle', required: false },
  { key: 'category' as const, label: 'Category', required: false },
  { key: 'date' as const, label: 'Date', required: false },
  { key: 'notes' as const, label: 'Notes', required: false },
]

interface ImportResults {
  imported: number
  skipped: number
  errors: string[]
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CSVImportWizard({ open, onOpenChange, onDataChanged }: CSVImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [detected, setDetected] = useState<DetectedSubscription[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [results, setResults] = useState<ImportResults | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const { subscriptions, add: addSubscription } = useSubscriptionStore()
  const { categories } = useCategoryStore()
  const { settings } = useSettingsStore()
  const currency = (settings?.currency || 'USD') as CurrencyCode

  const existingNames = useMemo(
    () => new Set(subscriptions.map((s) => s.name.toLowerCase())),
    [subscriptions]
  )

  const resetState = useCallback(() => {
    setStep('upload')
    setCsvData(null)
    setFileName('')
    setFileSize(0)
    setMapping({})
    setDetected([])
    setIsImporting(false)
    setResults(null)
    setIsDragging(false)
  }, [])

  const handleClose = useCallback(
    (open: boolean) => {
      if (!open) resetState()
      onOpenChange(open)
    },
    [onOpenChange, resetState]
  )

  // ── Step 1: File Upload ───────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Please select a CSV file')
      return
    }

    try {
      const parsed = await parseCSVFile(file)

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        toast.error('CSV file is empty or has no data rows')
        return
      }

      setCsvData(parsed)
      setFileName(file.name)
      setFileSize(file.size)

      // Auto-detect column mapping
      const autoMapping = autoDetectColumnMapping(parsed.headers)
      setMapping(autoMapping)

      setStep('mapping')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to read CSV file')
    }
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    [processFile]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  // ── Step 2: Column Mapping ────────────────────────────────────────

  const handleMappingNext = useCallback(() => {
    if (!csvData) return

    if (mapping.name === undefined || mapping.amount === undefined) {
      toast.error('Name and Amount mappings are required')
      return
    }

    const detectedSubs = detectRecurringCharges(csvData.rows, mapping)

    if (detectedSubs.length === 0) {
      toast.error('No subscriptions detected. Check your column mappings.')
      return
    }

    setDetected(detectedSubs)
    setStep('review')
  }, [csvData, mapping])

  // ── Step 3: Review & Edit ─────────────────────────────────────────

  const toggleSubscription = useCallback((index: number) => {
    setDetected((prev) =>
      prev.map((sub, i) =>
        i === index ? { ...sub, include: !sub.include } : sub
      )
    )
  }, [])

  const updateSubscriptionField = useCallback(
    <K extends keyof DetectedSubscription>(
      index: number,
      field: K,
      value: DetectedSubscription[K]
    ) => {
      setDetected((prev) =>
        prev.map((sub, i) =>
          i === index ? { ...sub, [field]: value } : sub
        )
      )
    },
    []
  )

  const toggleAll = useCallback(() => {
    const allIncluded = detected.every((s) => s.include)
    setDetected((prev) => prev.map((sub) => ({ ...sub, include: !allIncluded })))
  }, [detected])

  const selectedCount = useMemo(() => detected.filter((s) => s.include).length, [detected])

  // ── Step 4: Import ────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    const toImport = detected.filter((s) => s.include)
    if (toImport.length === 0) {
      toast.error('No subscriptions selected')
      return
    }

    setIsImporting(true)
    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const sub of toImport) {
      const isDuplicate = existingNames.has(sub.name.toLowerCase())
      if (isDuplicate) {
        skipped++
        continue
      }

      // Try to match category
      let categoryId: string | null = null
      if (sub.category_name) {
        const matched = categories.find(
          (c) => c.name.toLowerCase() === sub.category_name!.toLowerCase()
        )
        if (matched) categoryId = matched.id
      }

      try {
        await addSubscription({
          name: sub.name,
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
          next_payment_date:
            sub.next_payment_date || new Date().toISOString().split('T')[0],
        })
        imported++
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push(`Failed to import "${sub.name}": ${msg}`)
      }
    }

    setIsImporting(false)
    setResults({ imported, skipped, errors })
    setStep('results')

    if (imported > 0) {
      onDataChanged()
    }
  }, [detected, existingNames, categories, addSubscription, currency, onDataChanged])

  // ── Render ────────────────────────────────────────────────────────

  const stepNumber = step === 'upload' ? 1 : step === 'mapping' ? 2 : step === 'review' ? 3 : 4

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[85vh] w-full flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-[family-name:var(--font-heading)] text-xl">
            Import from CSV
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV file or bank statement to detect subscriptions.'}
            {step === 'mapping' && 'Map CSV columns to subscription fields.'}
            {step === 'review' && 'Review detected subscriptions and select which to import.'}
            {step === 'results' && 'Import complete.'}
          </DialogDescription>
          {/* Step indicator */}
          <div className="flex items-center gap-1 pt-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={`step-indicator-${s}`} className="flex items-center gap-1">
                <div
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-[family-name:var(--font-mono)] text-[10px] font-bold transition-colors ${
                    s === stepNumber
                      ? 'bg-primary text-white'
                      : s < stepNumber
                        ? 'bg-primary/20 text-primary'
                        : 'bg-border text-muted-foreground'
                  }`}
                >
                  {s < stepNumber ? <Check className="h-3 w-3" /> : s}
                </div>
                {s < 4 && (
                  <div
                    className={`h-px w-6 transition-colors ${
                      s < stepNumber ? 'bg-primary/40' : 'bg-border'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {step === 'upload' && (
            <UploadStep
              fileInputRef={fileInputRef}
              isDragging={isDragging}
              fileName={fileName}
              fileSize={fileSize}
              onFileSelect={handleFileSelect}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            />
          )}

          {step === 'mapping' && csvData && (
            <MappingStep
              csvData={csvData}
              mapping={mapping}
              onMappingChange={setMapping}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              detected={detected}
              existingNames={existingNames}
              currency={currency}
              categories={categories}
              onToggle={toggleSubscription}
              onToggleAll={toggleAll}
              onUpdateField={updateSubscriptionField}
            />
          )}

          {step === 'results' && results && (
            <ResultsStep results={results} />
          )}
        </div>

        <DialogFooter className="border-border flex-shrink-0 border-t pt-4">
          <div className="flex w-full items-center justify-between gap-2">
            {step === 'mapping' && (
              <>
                <Button variant="outline" onClick={() => setStep('upload')} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  onClick={handleMappingNext}
                  disabled={mapping.name === undefined || mapping.amount === undefined}
                  className="gap-1.5"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}

            {step === 'review' && (
              <>
                <Button variant="outline" onClick={() => setStep('mapping')} className="gap-1.5">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || selectedCount === 0}
                  className="gap-1.5"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3.5 w-3.5" />
                      Import {selectedCount} subscription{selectedCount !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </>
            )}

            {step === 'results' && (
              <div className="flex w-full justify-end">
                <Button onClick={() => handleClose(false)}>Done</Button>
              </div>
            )}

            {step === 'upload' && (
              <div className="flex w-full justify-end">
                <Button variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Step 1: Upload ──────────────────────────────────────────────────

function UploadStep({
  fileInputRef,
  isDragging,
  fileName,
  fileSize,
  onFileSelect,
  onDrop,
  onDragOver,
  onDragLeave,
}: {
  fileInputRef: React.RefObject<HTMLInputElement | null>
  isDragging: boolean
  fileName: string
  fileSize: number
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
}) {
  return (
    <div className="flex flex-col gap-5 py-4">
      <button
        onClick={() => fileInputRef.current?.click()}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors ${
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <div className="bg-primary/10 text-primary flex h-12 w-12 items-center justify-center rounded-full">
          <FileSpreadsheet className="h-6 w-6" />
        </div>
        <div className="text-center">
          <p className="text-foreground text-sm font-medium">
            {isDragging ? 'Drop your CSV file here' : 'Drag & drop a CSV file or click to browse'}
          </p>
          <p className="text-muted-foreground mt-1 text-xs">
            Supports bank statements and subscription exports (.csv)
          </p>
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={onFileSelect}
        className="hidden"
      />

      {fileName && (
        <div className="border-border flex items-center gap-3 rounded-lg border bg-[var(--color-subtle-overlay)] px-3 py-2.5">
          <FileSpreadsheet className="text-primary h-4 w-4 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-foreground truncate text-sm font-medium">{fileName}</p>
            <p className="text-muted-foreground text-[11px]">{formatFileSize(fileSize)}</p>
          </div>
          <Check className="h-4 w-4 flex-shrink-0 text-emerald-500" />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          How it works
        </p>
        <div className="text-muted-foreground flex flex-col gap-1.5 text-xs">
          <p>1. Upload a CSV file (bank statement or subscription list)</p>
          <p>2. Map columns to subscription fields</p>
          <p>3. Review detected recurring charges</p>
          <p>4. Import selected subscriptions</p>
        </div>
      </div>
    </div>
  )
}

// ── Step 2: Column Mapping ──────────────────────────────────────────

function MappingStep({
  csvData,
  mapping,
  onMappingChange,
}: {
  csvData: CSVParseResult
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
}) {
  const previewRows = csvData.rows.slice(0, 3)

  const updateMapping = (field: keyof ColumnMapping, value: number | undefined) => {
    const next = { ...mapping }
    if (value === undefined) {
      delete next[field]
    } else {
      next[field] = value
    }
    onMappingChange(next)
  }

  const hasAutoDetected = mapping.name !== undefined || mapping.amount !== undefined

  return (
    <div className="flex flex-col gap-5 py-4">
      {hasAutoDetected && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
          <p className="text-muted-foreground text-xs">
            Some columns were auto-detected. Verify the mappings below.
          </p>
        </div>
      )}

      {/* Column mapping fields */}
      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          Column mapping
        </p>
        {FIELD_OPTIONS.map((field) => (
          <div
            key={field.key}
            className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <label className="text-foreground text-sm sm:min-w-[120px]">
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
                {csvData.headers.map((header, i) => (
                  <option key={`mapping-col-${header}-${i}`} value={i}>
                    {header}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 h-4 w-4 -translate-y-1/2" />
            </div>
          </div>
        ))}
      </div>

      {/* Data preview */}
      {previewRows.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
            Data preview ({csvData.rows.length} rows total)
          </p>
          <div className="border-border overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[400px]">
                <thead>
                  <tr className="border-border border-b bg-[var(--color-subtle-overlay)]">
                    {csvData.headers.map((header, i) => (
                      <th
                        key={`preview-header-${header}-${i}`}
                        className="text-muted-foreground whitespace-nowrap px-3 py-2 text-left font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {previewRows.map((row, ri) => (
                    <tr key={`preview-row-${ri}`}>
                      {csvData.headers.map((_, ci) => (
                        <td
                          key={`preview-cell-${ri}-${ci}`}
                          className="text-foreground max-w-[200px] truncate whitespace-nowrap px-3 py-2 text-xs"
                        >
                          {row[ci] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Step 3: Review ──────────────────────────────────────────────────

function ReviewStep({
  detected,
  existingNames,
  currency,
  categories,
  onToggle,
  onToggleAll,
  onUpdateField,
}: {
  detected: DetectedSubscription[]
  existingNames: Set<string>
  currency: CurrencyCode
  categories: Array<{ id: string; name: string }>
  onToggle: (index: number) => void
  onToggleAll: () => void
  onUpdateField: <K extends keyof DetectedSubscription>(
    index: number,
    field: K,
    value: DetectedSubscription[K]
  ) => void
}) {
  const allIncluded = detected.every((s) => s.include)
  const duplicateCount = detected.filter(
    (s) => s.include && existingNames.has(s.name.toLowerCase())
  ).length

  return (
    <div className="flex flex-col gap-4 py-2">
      {/* Stats */}
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase">
          Detected
        </span>
        <span className="bg-primary/10 text-primary rounded px-2 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-medium tracking-wider uppercase">
          {detected.length} subscription{detected.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Duplicate warning */}
      {duplicateCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
          <p className="text-muted-foreground text-xs">
            {duplicateCount} subscription{duplicateCount !== 1 ? 's' : ''} already exist and will
            be skipped during import.
          </p>
        </div>
      )}

      {/* Subscription table */}
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[550px]">
            <thead>
              <tr className="border-border border-b bg-[var(--color-subtle-overlay)]">
                <th className="w-10 px-3 py-2.5">
                  <button
                    onClick={onToggleAll}
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                      allIncluded
                        ? 'border-primary bg-primary'
                        : 'border-border hover:border-foreground'
                    }`}
                  >
                    {allIncluded && <Check className="h-3 w-3 text-white" />}
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
                <th className="text-muted-foreground hidden px-3 py-2.5 text-center font-[family-name:var(--font-mono)] text-[10px] font-normal tracking-widest uppercase lg:table-cell">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {detected.map((sub, i) => {
                const isDuplicate = existingNames.has(sub.name.toLowerCase())

                return (
                  <tr
                    key={`detected-${sub.name}-${i}`}
                    className={`transition-colors ${
                      sub.include ? 'bg-[var(--color-subtle-overlay)]' : 'opacity-40'
                    } ${isDuplicate ? 'bg-amber-500/5' : ''}`}
                  >
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => onToggle(i)}
                        className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                          sub.include
                            ? 'border-primary bg-primary'
                            : 'border-border hover:border-foreground'
                        }`}
                      >
                        {sub.include && <Check className="h-3 w-3 text-white" />}
                      </button>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground text-sm">{sub.name}</span>
                        {isDuplicate && (
                          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9px] tracking-wider text-amber-400 uppercase">
                            Exists
                          </span>
                        )}
                        {sub.source_rows.length > 1 && (
                          <span className="text-muted-foreground font-[family-name:var(--font-mono)] text-[9px]">
                            ({sub.source_rows.length}x)
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
                      <div className="relative">
                        <select
                          value={sub.billing_cycle}
                          onChange={(e) =>
                            onUpdateField(i, 'billing_cycle', e.target.value as BillingCycle)
                          }
                          className="border-border bg-input text-foreground h-7 w-full appearance-none rounded border pr-6 pl-2 font-[family-name:var(--font-mono)] text-[10px] tracking-wider uppercase focus:outline-none"
                        >
                          {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                            <option key={`cycle-${value}`} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-1 h-3 w-3 -translate-y-1/2" />
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 md:table-cell">
                      <div className="relative">
                        <select
                          value={sub.category_name || ''}
                          onChange={(e) =>
                            onUpdateField(
                              i,
                              'category_name',
                              e.target.value || undefined
                            )
                          }
                          className="border-border bg-input text-foreground h-7 w-full appearance-none rounded border pr-6 pl-2 text-xs focus:outline-none"
                        >
                          <option value="">--</option>
                          {categories.map((cat) => (
                            <option key={`cat-${cat.id}`} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="text-muted-foreground pointer-events-none absolute top-1/2 right-1 h-3 w-3 -translate-y-1/2" />
                      </div>
                    </td>
                    <td className="hidden px-3 py-2.5 text-center lg:table-cell">
                      <ConfidenceBadge confidence={sub.confidence} />
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

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  let colorClass = 'border-red-500/30 bg-red-500/10 text-red-400'
  if (confidence >= 0.8) {
    colorClass = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
  } else if (confidence >= 0.5) {
    colorClass = 'border-amber-500/30 bg-amber-500/10 text-amber-400'
  }

  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[9px] tracking-wider ${colorClass}`}
    >
      {pct}%
    </span>
  )
}

// ── Step 4: Results ─────────────────────────────────────────────────

function ResultsStep({ results }: { results: ImportResults }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8">
      <div className="bg-primary/10 text-primary flex h-16 w-16 items-center justify-center rounded-full">
        {results.imported > 0 ? (
          <Check className="h-8 w-8" />
        ) : (
          <X className="h-8 w-8" />
        )}
      </div>

      <div className="text-center">
        <p className="text-foreground font-[family-name:var(--font-heading)] text-lg font-semibold">
          {results.imported > 0 ? 'Import Complete' : 'No Subscriptions Imported'}
        </p>
        <div className="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
          {results.imported > 0 && (
            <p className="text-emerald-400">
              {results.imported} subscription{results.imported !== 1 ? 's' : ''} imported
            </p>
          )}
          {results.skipped > 0 && (
            <p className="text-amber-400">
              {results.skipped} skipped (already exist)
            </p>
          )}
        </div>
      </div>

      {results.errors.length > 0 && (
        <div className="w-full rounded-lg border border-red-500/30 bg-red-500/5 p-3">
          <p className="mb-1 text-xs font-medium text-red-400">
            {results.errors.length} error{results.errors.length !== 1 ? 's' : ''}
          </p>
          <div className="max-h-24 overflow-y-auto">
            {results.errors.map((err, i) => (
              <p
                key={`result-error-${i}-${err.slice(0, 20)}`}
                className="text-muted-foreground text-[11px]"
              >
                {err}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
