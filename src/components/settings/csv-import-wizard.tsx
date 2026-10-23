import { useState, useRef, useMemo, useCallback, useEffect, useId } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  CircleCheck,
  CircleX,
  FileSpreadsheet,
  Loader2,
  Pencil,
  RotateCw,
  TriangleAlert,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { FieldError } from '@/components/ui/field'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { BillingCycle } from '@/types/subscription'
import {
  parseCSVFile,
  autoDetectColumnMapping,
  detectRecurringCharges,
  type CSVParseResult,
  type ColumnMapping,
  type DetectedSubscription,
} from '@/lib/csv-import'
import { detectAmountFormat, type AmountFormat, type DateFormat } from '@/lib/csv-parser'
import {
  importSubscriptions,
  type SubscriptionImportOptions,
  type SubscriptionImportStatus,
  type SubscriptionImportRow,
} from '@/lib/subscription-import'
import {
  NEW_CATEGORY_STYLE,
  columnSamples,
  detectDateFormat,
  plural,
  resolveAmountFormat,
  resolveDateFormat,
  type DateColumnReading,
  type DetectedAmountFormat,
} from './import-formats'
import {
  ChoiceGroup,
  ColumnMappingFields,
  FileDropzone,
  FormatFields,
  ImportDialogBody,
  ImportSection,
  MappingIntro,
  NativeSelect,
  RowIssueList,
  SelectionCheckbox,
} from './import-parts'

interface CSVImportWizardProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDataChanged: () => void
}

type WizardStep = 'upload' | 'mapping' | 'review' | 'results'
type DuplicateMode = SubscriptionImportOptions['duplicateMode']
type MissingCategoryMode = SubscriptionImportOptions['missingCategory']

const STEPS: readonly { key: WizardStep; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'mapping', label: 'Columns' },
  { key: 'review', label: 'Review' },
  { key: 'results', label: 'Results' },
]

const FIELD_OPTIONS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'billing_cycle', label: 'Billing cycle', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'date', label: 'Date', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const satisfies readonly { key: keyof ColumnMapping; label: string; required: boolean }[]

const DUPLICATE_OPTIONS: readonly { value: DuplicateMode; label: string }[] = [
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'rename', label: 'Rename & import' },
]

const MISSING_CATEGORY_OPTIONS: readonly { value: MissingCategoryMode; label: string }[] = [
  { value: 'ignore', label: 'Leave uncategorized' },
  { value: 'create', label: 'Create missing' },
]

const PREVIEW_ROWS = 3

/** What happened to one detected subscription the last time it was sent. */
interface RowResult {
  subscription: DetectedSubscription
  status: SubscriptionImportStatus
  /** Saved name; differs from the detected name when the rename policy added a suffix. */
  savedName: string
  reason?: string
}

/** Session results by spreadsheet row: a retried row replaces its earlier outcome. */
type ImportResults = Map<number, RowResult>

interface ResultCounts {
  total: number
  imported: number
  skipped: number
  failed: number
}

type ResultStatus = 'complete' | 'partial' | 'failed' | 'empty'

const RESULT_TITLES: Record<ResultStatus, string> = {
  complete: 'Import complete',
  partial: 'Partly imported',
  failed: 'Import failed',
  empty: 'Nothing new to import',
}

const RESULT_DESCRIPTIONS: Record<ResultStatus, string> = {
  complete: 'The imported subscriptions are in Kessai now.',
  partial: 'Retry the failed rows, or edit them first.',
  failed: 'No subscriptions were imported. Retry the failed rows, or edit them first.',
  empty: 'Every selected subscription already exists in Kessai.',
}

const RESULT_ICONS = {
  complete: CircleCheck,
  partial: TriangleAlert,
  failed: CircleX,
  empty: Check,
} as const

const STATUS_BADGES: Record<SubscriptionImportStatus, { label: string; variant: BadgeVariant }> = {
  failed: { label: 'Failed', variant: 'danger' },
  skipped: { label: 'Skipped', variant: 'secondary' },
  imported: { label: 'Imported', variant: 'success' },
}

/** Failed rows first: they are the ones that need a decision. */
const STATUS_ORDER: Record<SubscriptionImportStatus, number> = {
  failed: 0,
  skipped: 1,
  imported: 2,
}

function countResults(results: ImportResults): ResultCounts {
  const counts: ResultCounts = { total: results.size, imported: 0, skipped: 0, failed: 0 }
  for (const result of results.values()) counts[result.status]++
  return counts
}

function getResultStatus(counts: ResultCounts): ResultStatus {
  if (counts.failed > 0) return counts.imported > 0 ? 'partial' : 'failed'
  return counts.imported > 0 ? 'complete' : 'empty'
}

/** "Imported 8 of 10 · 2 failed": every attempted row is accounted for. */
function summarizeResults(counts: ResultCounts): string {
  const parts = [`Imported ${counts.imported} of ${counts.total}`]
  if (counts.skipped > 0) parts.push(`${counts.skipped} skipped`)
  if (counts.failed > 0) parts.push(`${counts.failed} failed`)
  return parts.join(' · ')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const normalizeName = (name: string) => name.trim().toLowerCase()

/** Spreadsheet line of the subscription's first source record (header is line 1). */
function importRowNumber(sub: DetectedSubscription): number {
  return sub.source_rows[0] + 2
}

function formatSourceRows(sourceRows: number[]): string {
  const lines = sourceRows
    .slice(0, 3)
    .map((index) => index + 2)
    .join(', ')
  const more = sourceRows.length > 3 ? ` +${sourceRows.length - 3}` : ''
  return `${sourceRows.length === 1 ? 'Row' : 'Rows'} ${lines}${more}`
}

function toImportRow(sub: DetectedSubscription): SubscriptionImportRow {
  return {
    row: importRowNumber(sub),
    name: sub.name,
    amount: sub.amount,
    currency: sub.currency,
    billing_cycle: sub.billing_cycle,
    category_name: sub.category_name,
    notes: sub.notes,
    next_payment_date: sub.next_payment_date,
  }
}

export function CSVImportWizard({ open, onOpenChange, onDataChanged }: CSVImportWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload')
  const [csvData, setCsvData] = useState<CSVParseResult | null>(null)
  const [fileName, setFileName] = useState('')
  const [fileSize, setFileSize] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [autoMatch, setAutoMatch] = useState({ count: 0, required: false })
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [amountFormat, setAmountFormat] = useState<AmountFormat>('auto')
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [mappingAttempts, setMappingAttempts] = useState(0)
  const [detected, setDetected] = useState<DetectedSubscription[]>([])
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const [missingCategory, setMissingCategory] = useState<MissingCategoryMode>('ignore')
  const [reviewingFailed, setReviewingFailed] = useState(false)
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null)
  const [importSnapshot, setImportSnapshot] = useState<Set<string> | null>(null)
  const [results, setResults] = useState<ImportResults | null>(null)
  // Synchronous guard: state updates land too late to stop a second click or drop.
  const busyRef = useRef(false)

  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const addSubscription = useSubscriptionStore((s) => s.add)
  const categories = useCategoryStore((s) => s.categories)
  const addCategory = useCategoryStore((s) => s.add)
  const currency = (useSettingsStore((s) => s.settings?.currency) || 'USD') as CurrencyCode
  const fetchSubscriptions = useSubscriptionStore((s) => s.fetch)
  const fetchCategories = useCategoryStore((s) => s.fetch)

  // Settings does not load subscriptions itself; duplicate checks need the saved names.
  useEffect(() => {
    if (!open) return
    void fetchSubscriptions()
    void fetchCategories()
  }, [open, fetchSubscriptions, fetchCategories])

  const liveExistingNames = useMemo(
    () => new Set(subscriptions.map((s) => normalizeName(s.name))),
    [subscriptions]
  )
  // Rows written during an import must not flip to "Exists" in the list mid-run.
  const existingNames = importSnapshot ?? liveExistingNames
  const isImporting = busy === 'importing'

  const beginOperation = useCallback((kind: 'reading' | 'importing') => {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(kind)
    return true
  }, [])

  const endOperation = useCallback(() => {
    busyRef.current = false
    setBusy(null)
  }, [])

  const resetState = useCallback(() => {
    setStep('upload')
    setCsvData(null)
    setFileName('')
    setFileSize(0)
    setUploadError(null)
    setAutoMatch({ count: 0, required: false })
    setMapping({})
    setAmountFormat('auto')
    setDateFormat('auto')
    setMappingAttempts(0)
    setDetected([])
    setDuplicateMode('skip')
    setMissingCategory('ignore')
    setReviewingFailed(false)
    setImportSnapshot(null)
    setResults(null)
  }, [])

  const handleClose = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        // Closing mid-operation would discard the outcome of writes already in flight.
        if (busyRef.current) return
        resetState()
      }
      onOpenChange(nextOpen)
    },
    [onOpenChange, resetState]
  )

  // ── Step 1: File Upload ───────────────────────────────────────────

  // Errors render under the upload panel; a toast would only repeat them.
  const processFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        setUploadError(`${file.name} isn't a CSV file. Export the statement as .csv and choose it.`)
        return
      }
      if (!beginOperation('reading')) return

      try {
        const parsed = await parseCSVFile(file)

        if (parsed.headers.length === 0 || parsed.rows.length === 0) {
          setUploadError(
            `${file.name} has no data rows. It needs a header row and at least one charge.`
          )
          return
        }

        const detectedMapping = autoDetectColumnMapping(parsed.headers)
        setUploadError(null)
        setCsvData(parsed)
        setFileName(file.name)
        setFileSize(file.size)
        setMapping(detectedMapping)
        setAutoMatch({
          count: Object.values(detectedMapping).filter((column) => column !== undefined).length,
          required: detectedMapping.name !== undefined && detectedMapping.amount !== undefined,
        })
        setAmountFormat('auto')
        setDateFormat('auto')
        setMappingAttempts(0)
        setStep('mapping')
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to read CSV file')
      } finally {
        endOperation()
      }
    },
    [beginOperation, endOperation]
  )

  // ── Step 2: Column Mapping ────────────────────────────────────────

  const amountColumn = mapping.amount
  const detectedAmountFormat = useMemo<DetectedAmountFormat | null>(() => {
    if (!csvData || amountColumn === undefined) return null
    return detectAmountFormat(
      csvData.rows.map((row) => row[amountColumn] ?? ''),
      csvData.delimiter
    )
  }, [csvData, amountColumn])

  const amountSamples = useMemo(
    () => (csvData && amountColumn !== undefined ? columnSamples(csvData.rows, amountColumn) : []),
    [csvData, amountColumn]
  )

  const dateColumn = mapping.date
  const dateReading = useMemo(
    () =>
      csvData && dateColumn !== undefined
        ? detectDateFormat(csvData.rows.map((row) => row[dateColumn] ?? ''))
        : null,
    [csvData, dateColumn]
  )

  const resolvedAmountFormat = resolveAmountFormat(amountFormat, detectedAmountFormat)
  const resolvedDateFormat = resolveDateFormat(dateFormat, dateReading)

  const analysis = useMemo(() => {
    if (
      !csvData ||
      mapping.name === undefined ||
      mapping.amount === undefined ||
      !resolvedAmountFormat
    ) {
      return null
    }
    const errors: string[] = []
    const found = detectRecurringCharges(
      csvData.rows,
      mapping,
      { amountFormat: resolvedAmountFormat, dateFormat: resolvedDateFormat },
      errors
    )
    return { detected: found, errors }
  }, [csvData, mapping, resolvedAmountFormat, resolvedDateFormat])

  const mappingProblem =
    mapping.name === undefined || mapping.amount === undefined
      ? 'Map the Name and Amount columns to continue.'
      : !resolvedAmountFormat
        ? 'Amounts use more than one decimal style. Choose an amount format to continue.'
        : analysis && analysis.detected.length === 0
          ? 'No subscriptions detected. Check the columns and formats above.'
          : null

  const handleMappingNext = useCallback(() => {
    if (!analysis || analysis.detected.length === 0) {
      setMappingAttempts((count) => count + 1)
      return
    }
    setDetected(analysis.detected)
    setReviewingFailed(false)
    setStep('review')
  }, [analysis])

  // ── Step 3: Review & Edit ─────────────────────────────────────────

  const toggleSubscription = useCallback((index: number) => {
    setDetected((prev) =>
      prev.map((sub, i) => (i === index ? { ...sub, include: !sub.include } : sub))
    )
  }, [])

  const updateSubscriptionField = useCallback(
    <K extends keyof DetectedSubscription>(
      index: number,
      field: K,
      value: DetectedSubscription[K]
    ) => {
      setDetected((prev) => prev.map((sub, i) => (i === index ? { ...sub, [field]: value } : sub)))
    },
    []
  )

  const toggleAll = useCallback(() => {
    setDetected((prev) => {
      const allIncluded = prev.every((s) => s.include)
      return prev.map((sub) => ({ ...sub, include: !allIncluded }))
    })
  }, [])

  const selectedCount = useMemo(() => detected.filter((s) => s.include).length, [detected])

  const failedResults = useMemo(
    () => [...(results?.values() ?? [])].filter((result) => result.status === 'failed'),
    [results]
  )

  const failureReasons = useMemo(
    () =>
      new Map(
        failedResults.map(
          (result) =>
            [importRowNumber(result.subscription), result.reason ?? 'Not imported'] as const
        )
      ),
    [failedResults]
  )

  // ── Step 4: Import ────────────────────────────────────────────────

  const runImport = useCallback(
    async (toImport: DetectedSubscription[]) => {
      if (toImport.length === 0 || !beginOperation('importing')) return
      setImportSnapshot(liveExistingNames)
      let categoriesCreated = 0

      try {
        const outcome = await importSubscriptions(toImport.map(toImportRow), {
          existingNames: subscriptions.map((s) => s.name),
          categories,
          duplicateMode,
          missingCategory,
          createCategory: async (name) => {
            await addCategory({ name, ...NEW_CATEGORY_STYLE })
            categoriesCreated++
            const key = normalizeName(name)
            const { categories: latest } = useCategoryStore.getState()
            const saved = latest.find((c) => normalizeName(c.name) === key)
            if (!saved) throw new Error(`Category "${name}" was created but could not be found`)
            return saved
          },
          addSubscription,
          defaultCurrency: currency,
        })

        const outcomes = new Map(outcome.rows.map((row) => [row.row, row] as const))
        // Rows left out of this attempt keep their earlier outcome until they are sent again.
        setResults((prev) => {
          const next: ImportResults = new Map(prev ?? [])
          for (const subscription of toImport) {
            const row = outcomes.get(importRowNumber(subscription))
            if (!row) continue
            next.set(row.row, {
              subscription,
              status: row.status,
              savedName: row.name,
              reason: row.reason,
            })
          }
          return next
        })
        setReviewingFailed(false)
        setStep('results')

        if (outcome.imported > 0 || categoriesCreated > 0) {
          onDataChanged()
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Import failed')
      } finally {
        setImportSnapshot(null)
        endOperation()
      }
    },
    [
      beginOperation,
      endOperation,
      liveExistingNames,
      subscriptions,
      categories,
      duplicateMode,
      missingCategory,
      addCategory,
      addSubscription,
      currency,
      onDataChanged,
    ]
  )

  const handleImport = useCallback(() => {
    const toImport = detected.filter((s) => s.include)
    if (toImport.length === 0) {
      toast.error('No subscriptions selected')
      return
    }
    void runImport(toImport)
  }, [detected, runImport])

  const handleRetryFailed = useCallback(() => {
    void runImport(failedResults.map((result) => result.subscription))
  }, [failedResults, runImport])

  const handleEditFailed = useCallback(() => {
    if (busyRef.current) return
    setDetected(failedResults.map((result) => ({ ...result.subscription, include: true })))
    setReviewingFailed(true)
    setStep('review')
  }, [failedResults])

  const handleReviewBack = useCallback(() => {
    if (reviewingFailed) {
      setReviewingFailed(false)
      setStep('results')
    } else {
      setStep('mapping')
    }
  }, [reviewingFailed])

  // ── Render ────────────────────────────────────────────────────────

  const resultCounts = results ? countResults(results) : null
  const resultStatus = resultCounts ? getResultStatus(resultCounts) : null

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="gap-3">
          <div className="flex flex-col gap-1.5">
            <DialogTitle>Import from CSV</DialogTitle>
            <DialogDescription className="text-pretty">
              {step === 'upload' &&
                'Find recurring charges in a bank statement and add them as subscriptions.'}
              {step === 'mapping' &&
                'Match the columns, then check how amounts and dates are written.'}
              {step === 'review' &&
                (reviewingFailed
                  ? 'Adjust the failed subscriptions, then import them again.'
                  : 'Choose which subscriptions to import and how to handle duplicates.')}
              {step === 'results' && resultStatus && RESULT_DESCRIPTIONS[resultStatus]}
            </DialogDescription>
          </div>
          <StepIndicator step={step} />
        </DialogHeader>

        <ImportDialogBody step={reviewingFailed ? 'review-failed' : step}>
          {step === 'upload' && (
            <UploadStep
              isReading={busy === 'reading'}
              fileName={fileName}
              fileSize={fileSize}
              rowCount={csvData?.rows.length ?? 0}
              error={uploadError}
              onFile={(file) => void processFile(file)}
            />
          )}

          {step === 'mapping' && csvData && (
            <MappingStep
              csvData={csvData}
              autoMatch={autoMatch}
              mapping={mapping}
              onMappingChange={setMapping}
              amountFormat={amountFormat}
              detectedAmountFormat={detectedAmountFormat}
              amountSamples={amountSamples}
              onAmountFormatChange={setAmountFormat}
              dateFormat={dateFormat}
              dateReading={dateReading}
              onDateFormatChange={setDateFormat}
              analysis={analysis}
              problem={mappingProblem}
              attempts={mappingAttempts}
            />
          )}

          {step === 'review' && (
            <ReviewStep
              detected={detected}
              existingNames={existingNames}
              currency={currency}
              categories={categories}
              readErrors={reviewingFailed ? [] : (analysis?.errors ?? [])}
              failureReasons={reviewingFailed ? failureReasons : null}
              duplicateMode={duplicateMode}
              missingCategory={missingCategory}
              disabled={isImporting}
              onDuplicateModeChange={setDuplicateMode}
              onMissingCategoryChange={setMissingCategory}
              onToggle={toggleSubscription}
              onToggleAll={toggleAll}
              onUpdateField={updateSubscriptionField}
            />
          )}

          {step === 'results' && results && <ResultsStep results={results} currency={currency} />}
        </ImportDialogBody>

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={busy === 'reading'}
                className={csvData ? 'sm:mr-auto' : undefined}
              >
                Cancel
              </Button>
              {csvData && (
                <Button onClick={() => setStep('mapping')} disabled={busy === 'reading'}>
                  Next
                  <ChevronRight aria-hidden="true" />
                </Button>
              )}
            </>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')} className="sm:mr-auto">
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
              <Button
                onClick={handleMappingNext}
                disabled={mapping.name === undefined || mapping.amount === undefined}
              >
                Next
                <ChevronRight aria-hidden="true" />
              </Button>
            </>
          )}

          {step === 'review' && (
            <>
              <Button
                variant="outline"
                onClick={handleReviewBack}
                disabled={isImporting}
                className="sm:mr-auto"
              >
                <ArrowLeft aria-hidden="true" />
                {reviewingFailed ? 'Back to results' : 'Back'}
              </Button>
              <Button
                onClick={handleImport}
                disabled={isImporting || selectedCount === 0}
                aria-busy={isImporting || undefined}
              >
                {isImporting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                Import {plural(selectedCount, 'subscription')}
              </Button>
            </>
          )}

          {step === 'results' && failedResults.length > 0 && (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isImporting}
                className="sm:mr-auto"
              >
                Close
              </Button>
              <Button variant="outline" onClick={handleEditFailed} disabled={isImporting}>
                <Pencil aria-hidden="true" />
                Edit failed rows
              </Button>
              <Button
                onClick={handleRetryFailed}
                disabled={isImporting}
                aria-busy={isImporting || undefined}
              >
                {isImporting ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw aria-hidden="true" />
                )}
                Retry {plural(failedResults.length, 'failed row')}
              </Button>
            </>
          )}

          {step === 'results' && failedResults.length === 0 && (
            <Button onClick={() => handleClose(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Step indicator ──────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  const current = STEPS.findIndex((s) => s.key === step)

  return (
    <ol aria-label="Import steps" className="-mr-8 grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < current
        const active = i === current
        return (
          <li
            key={s.key}
            aria-current={active ? 'step' : undefined}
            className="flex min-w-0 flex-col gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                'h-0.5 transition-colors duration-150',
                active ? 'bg-foreground' : done ? 'bg-foreground/45' : 'bg-border-hover'
              )}
            />
            <span
              className={cn(
                'type-label flex min-w-0 items-center gap-1.5',
                active ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {/* Phones keep the full label; the bar above already marks done and current. */}
              {done ? (
                <Check
                  aria-hidden="true"
                  className="size-3 shrink-0 max-sm:hidden"
                  strokeWidth={3}
                />
              ) : (
                <span aria-hidden="true" className="tabular-nums max-sm:hidden">
                  {i + 1}
                </span>
              )}
              <span className="truncate">{s.label}</span>
              {done ? <span className="sr-only">(done)</span> : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

// ── Step 1: Upload ──────────────────────────────────────────────────

const UPLOAD_ERROR_ID = 'csv-import-upload-error'

function UploadStep({
  isReading,
  fileName,
  fileSize,
  rowCount,
  error,
  onFile,
}: {
  isReading: boolean
  fileName: string
  fileSize: number
  rowCount: number
  error: string | null
  onFile: (file: File) => void
}) {
  return (
    <div className="flex flex-col gap-6 pb-3">
      <div className="flex flex-col gap-2">
        <FileDropzone
          label="Upload CSV file"
          accept=".csv,text/csv"
          icon={FileSpreadsheet}
          title="Bank statement or subscription list"
          description="A CSV file, up to 10 MB."
          buttonLabel="Choose CSV file"
          busy={isReading}
          busyText="Reading the file…"
          describedBy={error ? UPLOAD_ERROR_ID : undefined}
          invalid={Boolean(error)}
          onFile={onFile}
        />
        <FieldError id={UPLOAD_ERROR_ID} className="flex items-start gap-2">
          {error ? (
            <>
              <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
              {error}
            </>
          ) : null}
        </FieldError>
      </div>

      {fileName && !error ? (
        <div className="border-border flex items-center gap-3 rounded-lg border px-3 py-2.5">
          <FileSpreadsheet aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="text-foreground truncate text-sm font-medium">{fileName}</p>
            <p className="type-label text-muted-foreground">
              {formatFileSize(fileSize)} · {plural(rowCount, 'row')}
            </p>
          </div>
          <Badge variant="success" size="sm">
            <Check aria-hidden="true" className="size-3" strokeWidth={3} />
            Loaded
          </Badge>
        </div>
      ) : null}

      <ImportSection title="What Kessai reads">
        <ul className="text-muted-foreground marker:text-border-hover flex list-disc flex-col gap-1.5 pl-4 text-sm leading-relaxed">
          <li>
            A name and an amount for every charge. You can change which columns they come from.
          </li>
          <li>
            Dates, when the file has them, to work out each billing cycle and the next payment.
          </li>
          <li>Charges that repeat under one name are selected for import; you choose the rest.</li>
        </ul>
      </ImportSection>
    </div>
  )
}

// ── Step 2: Column Mapping ──────────────────────────────────────────

function MappingStep({
  csvData,
  autoMatch,
  mapping,
  onMappingChange,
  amountFormat,
  detectedAmountFormat,
  amountSamples,
  onAmountFormatChange,
  dateFormat,
  dateReading,
  onDateFormatChange,
  analysis,
  problem,
  attempts,
}: {
  csvData: CSVParseResult
  autoMatch: { count: number; required: boolean }
  mapping: ColumnMapping
  onMappingChange: (mapping: ColumnMapping) => void
  amountFormat: AmountFormat
  detectedAmountFormat: DetectedAmountFormat | null
  amountSamples: string[]
  onAmountFormatChange: (format: AmountFormat) => void
  dateFormat: DateFormat
  dateReading: DateColumnReading | null
  onDateFormatChange: (format: DateFormat) => void
  analysis: { detected: DetectedSubscription[]; errors: string[] } | null
  problem: string | null
  attempts: number
}) {
  const problemRef = useRef<HTMLDivElement>(null)
  const previewRows = csvData.rows.slice(0, PREVIEW_ROWS)

  useEffect(() => {
    if (attempts > 0) problemRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [attempts])

  const updateMapping = (field: keyof ColumnMapping, value: number | undefined) => {
    const next = { ...mapping }
    if (value === undefined) {
      delete next[field]
    } else {
      next[field] = value
    }
    onMappingChange(next)
  }

  const readableRows = analysis ? csvData.rows.length - analysis.errors.length : 0

  return (
    <div className="flex flex-col gap-7 pb-3">
      <ImportSection
        title="Columns"
        description={
          <MappingIntro matched={autoMatch.count} requiredMatched={autoMatch.required} />
        }
      >
        <ColumnMappingFields
          fields={FIELD_OPTIONS}
          headers={csvData.headers}
          rows={csvData.rows}
          mapping={mapping}
          onChange={updateMapping}
        />
      </ImportSection>

      <ImportSection title="Formats">
        <FormatFields
          amountFormat={amountFormat}
          detectedAmount={detectedAmountFormat}
          amountSamples={amountSamples}
          onAmountFormatChange={onAmountFormatChange}
          dateFormat={dateFormat}
          dateReading={dateReading}
          dateMapped={mapping.date !== undefined}
          dateUnmappedText="Map a Date column to infer billing cycles and next payment dates."
          onDateFormatChange={onDateFormatChange}
        />
      </ImportSection>

      <ImportSection title="Detection">
        <p className="text-foreground text-sm" aria-live="polite">
          {analysis
            ? `Found ${plural(analysis.detected.length, 'subscription')} in ${readableRows} of ${plural(csvData.rows.length, 'row')}.`
            : mapping.name === undefined || mapping.amount === undefined
              ? 'Map Name and Amount to detect subscriptions.'
              : 'Choose an amount format to read amounts.'}
        </p>
        {analysis && analysis.errors.length > 0 && (
          <RowIssueList
            title={`${plural(analysis.errors.length, 'row')} could not be read`}
            errors={analysis.errors}
            hint="Rows that can't be read are left out. Adjust the columns or formats to include them."
          />
        )}
        {attempts > 0 && problem ? (
          <div ref={problemRef}>
            <FieldError className="flex items-start gap-2">
              <AlertCircle aria-hidden="true" className="mt-px size-4 shrink-0" />
              {problem}
            </FieldError>
          </div>
        ) : null}
      </ImportSection>

      {previewRows.length > 0 && (
        <ImportSection
          title="File preview"
          description={
            <p className="text-muted-foreground text-xs">
              First {previewRows.length} of {plural(csvData.rows.length, 'row')}.
            </p>
          }
        >
          <div className="border-border overflow-x-auto overscroll-x-contain rounded-lg border">
            <table className="w-full min-w-max text-left">
              <thead>
                <tr className="border-border border-b bg-[var(--color-subtle-overlay)]">
                  {csvData.headers.map((header, i) => (
                    <th
                      key={`preview-header-${header}-${i}`}
                      scope="col"
                      className="type-label text-muted-foreground px-3 py-2 font-normal whitespace-nowrap"
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
                        className="text-foreground max-w-[14rem] truncate px-3 py-2 text-xs whitespace-nowrap tabular-nums"
                      >
                        {row[ci] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ImportSection>
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
  readErrors,
  failureReasons,
  duplicateMode,
  missingCategory,
  disabled,
  onDuplicateModeChange,
  onMissingCategoryChange,
  onToggle,
  onToggleAll,
  onUpdateField,
}: {
  detected: DetectedSubscription[]
  existingNames: Set<string>
  currency: CurrencyCode
  categories: Array<{ id: string; name: string }>
  readErrors: string[]
  failureReasons: Map<number, string> | null
  duplicateMode: DuplicateMode
  missingCategory: MissingCategoryMode
  disabled: boolean
  onDuplicateModeChange: (mode: DuplicateMode) => void
  onMissingCategoryChange: (mode: MissingCategoryMode) => void
  onToggle: (index: number) => void
  onToggleAll: () => void
  onUpdateField: <K extends keyof DetectedSubscription>(
    index: number,
    field: K,
    value: DetectedSubscription[K]
  ) => void
}) {
  const selected = detected.filter((s) => s.include).length
  const selectAllId = useId()
  const duplicateCount = detected.filter(
    (s) => s.include && existingNames.has(normalizeName(s.name))
  ).length

  const categoryNames = new Map(categories.map((c) => [normalizeName(c.name), c.name] as const))
  const missingCategories = new Map<string, string>()
  let hasCategoryValues = false
  for (const sub of detected) {
    const name = sub.category_name?.trim()
    if (!sub.include || !name) continue
    hasCategoryValues = true
    if (!categoryNames.has(normalizeName(name))) missingCategories.set(normalizeName(name), name)
  }
  const missingList = [...missingCategories.values()].join(', ')
  const unknownCategoryNote = missingCategory === 'create' ? '(new)' : '(not found)'

  const duplicateSubject =
    duplicateCount === 1
      ? '1 selected subscription already exists'
      : `${duplicateCount} selected subscriptions already exist`
  const duplicateHint =
    duplicateCount === 0
      ? 'No selected subscriptions match existing names.'
      : duplicateMode === 'skip'
        ? `${duplicateSubject} and will be skipped.`
        : `${duplicateSubject} and will be imported with an "(imported)" suffix.`

  const categoryHint = !hasCategoryValues
    ? 'Selected rows have no category values.'
    : missingCategories.size === 0
      ? 'Every category matches an existing one.'
      : missingCategory === 'create'
        ? `Will create: ${missingList}.`
        : `Not found: ${missingList}. These subscriptions will be imported without a category.`

  return (
    <fieldset disabled={disabled} aria-busy={disabled} className="flex min-w-0 flex-col gap-6 pb-3">
      {readErrors.length > 0 && (
        <RowIssueList
          title={`${plural(readErrors.length, 'row')} could not be read`}
          errors={readErrors}
          hint="These rows are not part of the import. Go back to adjust the columns or formats."
        />
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <ChoiceGroup
          label="Existing names"
          value={duplicateMode}
          options={DUPLICATE_OPTIONS}
          onChange={onDuplicateModeChange}
          hint={duplicateHint}
        />
        <ChoiceGroup
          label="Missing categories"
          value={missingCategory}
          options={MISSING_CATEGORY_OPTIONS}
          onChange={onMissingCategoryChange}
          hint={categoryHint}
        />
      </div>

      <ImportSection title={failureReasons ? 'Failed rows' : 'Detected subscriptions'}>
        <div className="border-border overflow-hidden rounded-lg border">
          <div className="border-border flex items-center gap-3 border-b bg-[var(--color-subtle-overlay)] px-3 py-2">
            <label
              htmlFor={selectAllId}
              className="flex cursor-pointer items-center gap-3 pointer-coarse:min-h-11"
            >
              <SelectionCheckbox
                id={selectAllId}
                checked={detected.length > 0 && selected === detected.length}
                indeterminate={selected > 0 && selected < detected.length}
                onChange={onToggleAll}
              />
              <span className="text-foreground text-sm">Select all</span>
            </label>
            <span
              className="type-label text-muted-foreground ml-auto tabular-nums"
              aria-live="polite"
            >
              {selected} of {detected.length} selected
            </span>
          </div>
          <ul className="divide-border divide-y">
            {detected.map((sub, i) => (
              <ReviewRow
                key={`detected-${importRowNumber(sub)}`}
                sub={sub}
                index={i}
                currency={currency}
                categories={categories}
                knownCategory={
                  sub.category_name
                    ? categoryNames.get(normalizeName(sub.category_name))
                    : undefined
                }
                unknownCategoryNote={unknownCategoryNote}
                isDuplicate={existingNames.has(normalizeName(sub.name))}
                failure={failureReasons?.get(importRowNumber(sub))}
                onToggle={onToggle}
                onUpdateField={onUpdateField}
              />
            ))}
          </ul>
        </div>
      </ImportSection>
    </fieldset>
  )
}

function ReviewRow({
  sub,
  index,
  currency,
  categories,
  knownCategory,
  unknownCategoryNote,
  isDuplicate,
  failure,
  onToggle,
  onUpdateField,
}: {
  sub: DetectedSubscription
  index: number
  currency: CurrencyCode
  categories: Array<{ id: string; name: string }>
  knownCategory: string | undefined
  unknownCategoryNote: string
  isDuplicate: boolean
  failure: string | undefined
  onToggle: (index: number) => void
  onUpdateField: <K extends keyof DetectedSubscription>(
    index: number,
    field: K,
    value: DetectedSubscription[K]
  ) => void
}) {
  const categoryName = sub.category_name?.trim()
  const confidence = Math.round(sub.confidence * 100)

  return (
    <li className="flex flex-col gap-3 px-3 py-3">
      <div className="flex items-start gap-3">
        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 pointer-coarse:min-h-11">
          <SelectionCheckbox
            checked={sub.include}
            onChange={() => onToggle(index)}
            aria-label={`Select ${sub.name}`}
            className="mt-px"
          />
          <span className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  'text-sm font-medium break-words',
                  sub.include ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {sub.name}
              </span>
              {isDuplicate && (
                <Badge variant="warning" size="sm">
                  Exists
                </Badge>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="type-label text-muted-foreground">
                {formatSourceRows(sub.source_rows)}
                {sub.source_rows.length > 1 ? ` · ${plural(sub.source_rows.length, 'charge')}` : ''}
              </span>
              <Badge
                variant={confidence < 50 ? 'warning' : 'outline'}
                size="sm"
                title="How evenly the charge dates fit the billing cycle"
              >
                Cycle {confidence}%
              </Badge>
            </span>
            {failure !== undefined && (
              <span className="text-destructive text-xs font-medium">{failure}</span>
            )}
          </span>
        </label>
        <span
          className={cn(
            'shrink-0 pt-px font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums',
            sub.include ? 'text-foreground' : 'text-muted-foreground'
          )}
        >
          {formatCurrency(sub.amount, (sub.currency as CurrencyCode) || currency)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:pl-8">
        <NativeSelect
          compact
          className="min-w-0 sm:w-36"
          value={sub.billing_cycle}
          aria-label={`Billing cycle for ${sub.name}`}
          onChange={(e) => onUpdateField(index, 'billing_cycle', e.target.value as BillingCycle)}
        >
          {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
            <option key={`cycle-${value}`} value={value}>
              {label}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          compact
          className="min-w-0 sm:w-60"
          value={knownCategory ?? categoryName ?? ''}
          aria-label={`Category for ${sub.name}`}
          onChange={(e) => onUpdateField(index, 'category_name', e.target.value || undefined)}
        >
          <option value="">No category</option>
          {categoryName && knownCategory === undefined && (
            <option value={categoryName}>
              {categoryName} {unknownCategoryNote}
            </option>
          )}
          {categories.map((cat) => (
            <option key={`cat-${cat.id}`} value={cat.name}>
              {cat.name}
            </option>
          ))}
        </NativeSelect>
      </div>
    </li>
  )
}

// ── Step 4: Results ─────────────────────────────────────────────────

function ResultsStep({ results, currency }: { results: ImportResults; currency: CurrencyCode }) {
  const counts = countResults(results)
  const status = getResultStatus(counts)
  const rows = [...results.values()].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  return (
    <div className="flex flex-col gap-4 pb-3">
      <EmptyState
        variant="plain"
        size="compact"
        headingLevel="h3"
        tone={status === 'failed' ? 'danger' : 'neutral'}
        icon={RESULT_ICONS[status]}
        title={RESULT_TITLES[status]}
        description={<span className="tabular-nums">{summarizeResults(counts)}</span>}
        className="py-4"
      />

      <ul
        aria-label="Results by subscription"
        className="border-border divide-border divide-y rounded-lg border"
      >
        {rows.map(({ subscription, status: rowStatus, savedName, reason }) => {
          const badge = STATUS_BADGES[rowStatus]
          const renamed = rowStatus === 'imported' && savedName !== subscription.name.trim()
          return (
            <li key={importRowNumber(subscription)} className="flex items-start gap-3 px-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-foreground text-sm font-medium break-words">
                  {subscription.name}
                </p>
                <p className="type-label text-muted-foreground">
                  <span>{formatSourceRows(subscription.source_rows)}</span>
                  {' · '}
                  <span className="tabular-nums">
                    {formatCurrency(
                      subscription.amount,
                      (subscription.currency as CurrencyCode) || currency
                    )}
                  </span>
                </p>
                {renamed && <p className="text-muted-foreground text-xs">Saved as {savedName}</p>}
                {rowStatus === 'skipped' && (
                  <p className="text-muted-foreground text-xs">
                    A subscription with this name already exists.
                  </p>
                )}
                {rowStatus === 'failed' && reason && (
                  <p className="text-destructive text-xs font-medium">{reason}</p>
                )}
              </div>
              <Badge variant={badge.variant} size="sm" className="mt-px">
                {badge.label}
              </Badge>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
