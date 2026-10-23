import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, Check, FileUp, ListChecks, Loader2, RotateCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import {
  parseCSV,
  detectAndParseJSON,
  readFileAsText,
  findColumnMapping,
  type ParseResult,
} from '@/lib/import-parsers'
import {
  tokenizeCSV,
  detectAmountFormat,
  type AmountFormat,
  type CSVRecords,
  type DateFormat,
} from '@/lib/csv-parser'
import { importSubscriptions, type SubscriptionImportRow } from '@/lib/subscription-import'
import { useSubscriptionStore } from '@/stores/subscription-store'
import { useCategoryStore } from '@/stores/category-store'
import { useSettingsStore } from '@/stores/settings-store'
import { formatCurrency, type CurrencyCode } from '@/lib/currency'
import { BILLING_CYCLE_LABELS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { BillingCycle } from '@/types/subscription'
import {
  NEW_CATEGORY_STYLE,
  detectDateFormat,
  plural,
  skippedAsDuplicates,
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
  ImportNotice,
  ImportSection,
  MappingIntro,
  RowIssueList,
  SelectionCheckbox,
} from './import-parts'

interface ImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDataChanged: () => void
}

type ImportStep = 'upload' | 'mapping' | 'preview'
type DuplicateMode = 'skip' | 'rename'
type MissingCategoryMode = 'ignore' | 'create'
type DuplicateKind = 'exists' | 'repeat'

interface CsvSource {
  content: string
  records: CSVRecords
}

interface AutoMatch {
  count: number
  required: boolean
}

interface AttemptSummary {
  number: number
  imported: number
  skipped: number
  failed: number
}

interface ParseCheck {
  ready: number
  total: number
  errors: string[]
}

const MAPPABLE_FIELDS = [
  { key: 'name', label: 'Name', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'currency', label: 'Currency', required: false },
  { key: 'billing_cycle', label: 'Billing cycle', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'start_date', label: 'Start date', required: false },
  { key: 'notes', label: 'Notes', required: false },
] as const

/** Mirrors the shared import policy's name comparison so the preview predicts its decisions. */
const nameKey = (name: string) => name.trim().toLowerCase()

async function createImportCategory(name: string): Promise<{ id: string; name: string }> {
  await useCategoryStore.getState().add({ name, ...NEW_CATEGORY_STYLE })
  const key = nameKey(name)
  const created = useCategoryStore.getState().categories.find((c) => nameKey(c.name) === key)
  if (!created) throw new Error(`Category "${name}" was not saved`)
  return { id: created.id, name: created.name }
}

export function ImportDialog({ open, onOpenChange, onDataChanged }: ImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('upload')
  const [csv, setCsv] = useState<CsvSource | null>(null)
  const [autoMatch, setAutoMatch] = useState<AutoMatch>({ count: 0, required: false })
  const [columnMapping, setColumnMapping] = useState<Record<string, number>>({})
  const [amountFormat, setAmountFormat] = useState<AmountFormat>('auto')
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [rows, setRows] = useState<SubscriptionImportRow[]>([])
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set())
  const [failures, setFailures] = useState<Map<number, string>>(new Map())
  const [attempt, setAttempt] = useState<AttemptSummary | null>(null)
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip')
  const [missingCategory, setMissingCategory] = useState<MissingCategoryMode>('ignore')
  const [isImporting, setIsImporting] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const [uploadErrors, setUploadErrors] = useState<string[]>([])
  const inFlightRef = useRef(false)
  const sessionRef = useRef(0)

  const subscriptions = useSubscriptionStore((s) => s.subscriptions)
  const categories = useCategoryStore((s) => s.categories)
  const currency = (useSettingsStore((s) => s.settings?.currency) || 'USD') as CurrencyCode
  const fetchSubscriptions = useSubscriptionStore((s) => s.fetch)
  const fetchCategories = useCategoryStore((s) => s.fetch)

  // Settings does not load subscriptions itself; duplicate checks need the saved names.
  useEffect(() => {
    if (!open) return
    void fetchSubscriptions()
    void fetchCategories()
  }, [open, fetchSubscriptions, fetchCategories])

  // ── Mapping-derived state ──────────────────────────────────────────

  const amountColumn = columnMapping.amount
  const amountValues = useMemo(() => {
    if (!csv || amountColumn === undefined) return []
    return csv.records.rows.map((row) => row[amountColumn] ?? '').filter((v) => v.trim() !== '')
  }, [csv, amountColumn])

  const detectedAmount = useMemo<DetectedAmountFormat | null>(
    () =>
      csv && amountColumn !== undefined
        ? detectAmountFormat(amountValues, csv.records.delimiter)
        : null,
    [csv, amountColumn, amountValues]
  )

  const dateColumn = columnMapping.start_date
  const dateReading = useMemo<DateColumnReading | null>(
    () =>
      csv && dateColumn !== undefined
        ? detectDateFormat(csv.records.rows.map((row) => row[dateColumn] ?? ''))
        : null,
    [csv, dateColumn]
  )

  const effectiveAmountFormat = resolveAmountFormat(amountFormat, detectedAmount)
  const effectiveDateFormat = resolveDateFormat(dateFormat, dateReading)

  const hasRequiredMapping = columnMapping.name !== undefined && columnMapping.amount !== undefined

  const mappingParse = useMemo(() => {
    if (step !== 'mapping' || !csv || !hasRequiredMapping || !effectiveAmountFormat) return null
    return parseCSV(csv.content, columnMapping, {
      amountFormat: effectiveAmountFormat,
      dateFormat: effectiveDateFormat,
    })
  }, [step, csv, hasRequiredMapping, effectiveAmountFormat, effectiveDateFormat, columnMapping])

  // ── Preview-derived state ──────────────────────────────────────────

  const duplicateKinds = useMemo(() => {
    const existing = new Set(subscriptions.map((s) => nameKey(s.name)))
    const seen = new Set<string>()
    const kinds = new Map<number, DuplicateKind>()
    for (const row of rows) {
      const key = nameKey(row.name)
      const selected = selectedRows.has(row.row)
      if (existing.has(key)) kinds.set(row.row, 'exists')
      else if (selected && seen.has(key)) kinds.set(row.row, 'repeat')
      if (selected) seen.add(key)
    }
    return kinds
  }, [rows, selectedRows, subscriptions])

  const missingCategories = useMemo(() => {
    const known = new Set(categories.map((c) => nameKey(c.name)))
    const missing = new Map<string, string>()
    for (const row of rows) {
      const name = row.category_name?.trim()
      if (!name || !selectedRows.has(row.row)) continue
      const key = nameKey(name)
      if (!known.has(key) && !missing.has(key)) missing.set(key, name)
    }
    return missing
  }, [rows, selectedRows, categories])

  // ── Actions ────────────────────────────────────────────────────────

  const resetState = () => {
    sessionRef.current++
    setStep('upload')
    setCsv(null)
    setAutoMatch({ count: 0, required: false })
    setColumnMapping({})
    setAmountFormat('auto')
    setDateFormat('auto')
    setParseResult(null)
    setRows([])
    setSelectedRows(new Set())
    setFailures(new Map())
    setAttempt(null)
    setDuplicateMode('skip')
    setMissingCategory('ignore')
    setIsImporting(false)
    setIsReading(false)
    setUploadErrors([])
  }

  const showPreview = (result: ParseResult) => {
    const nextRows = result.subscriptions.map((sub, i) => ({ ...sub, row: result.sourceRows[i] }))
    setParseResult(result)
    setRows(nextRows)
    setSelectedRows(new Set(nextRows.map((r) => r.row)))
    setFailures(new Map())
    setAttempt(null)
    setStep('preview')
  }

  const processFile = async (file: File) => {
    const session = ++sessionRef.current
    setUploadErrors([])
    setIsReading(true)

    try {
      const content = await readFileAsText(file)
      if (session !== sessionRef.current) return

      if (file.name.toLowerCase().endsWith('.csv')) {
        const records = tokenizeCSV(content)
        if (records.headers.length === 0 || records.rows.length === 0) {
          setUploadErrors(['CSV file needs a header row and at least one data row'])
          return
        }
        const mapping = findColumnMapping(records.headers)
        setCsv({ content, records })
        setColumnMapping(mapping)
        setAutoMatch({
          count: Object.keys(mapping).length,
          required: mapping.name !== undefined && mapping.amount !== undefined,
        })
        setAmountFormat('auto')
        setDateFormat('auto')
        setStep('mapping')
        return
      }

      let data: unknown
      try {
        data = JSON.parse(content)
      } catch {
        setUploadErrors(['This file is not valid JSON'])
        return
      }
      const result = detectAndParseJSON(data)
      if (result.subscriptions.length === 0) {
        setUploadErrors(
          result.errors.length > 0 ? result.errors : ['No subscriptions found in this file']
        )
        return
      }
      setCsv(null)
      showPreview(result)
    } catch (error) {
      if (session === sessionRef.current) {
        setUploadErrors([error instanceof Error ? error.message : 'Failed to read file'])
      }
    } finally {
      if (session === sessionRef.current) setIsReading(false)
    }
  }

  const handleMappingComplete = () => {
    // The parse check lists every unreadable row; preview needs at least one readable row.
    if (mappingParse && mappingParse.subscriptions.length > 0) showPreview(mappingParse)
  }

  const handleImport = async () => {
    if (inFlightRef.current) return
    const batch = rows.filter((r) => selectedRows.has(r.row))
    if (batch.length === 0) {
      toast.error('No subscriptions selected for import')
      return
    }

    inFlightRef.current = true
    setIsImporting(true)
    try {
      const outcome = await importSubscriptions(batch, {
        existingNames: useSubscriptionStore.getState().subscriptions.map((s) => s.name),
        categories: useCategoryStore.getState().categories,
        duplicateMode,
        missingCategory,
        createCategory: createImportCategory,
        addSubscription: (data) => useSubscriptionStore.getState().add(data),
        defaultCurrency: currency,
      })

      // Keep this attempt's failures (selected) plus earlier failures the user left out of it.
      const reasons = new Map(outcome.failed.map((f) => [f.row, f.reason]))
      const remaining: SubscriptionImportRow[] = []
      const nextFailures = new Map<number, string>()
      const nextSelected = new Set<number>()
      for (const r of rows) {
        const attempted = selectedRows.has(r.row)
        const reason = attempted ? reasons.get(r.row) : failures.get(r.row)
        if (reason === undefined) continue
        remaining.push(r)
        nextFailures.set(r.row, reason)
        if (attempted) nextSelected.add(r.row)
      }
      const unread = parseResult?.errors.length ?? 0
      const summary = [`Imported ${plural(outcome.imported, 'subscription')}`]
      if (outcome.skipped > 0) summary.push(skippedAsDuplicates(outcome.skipped))

      if (remaining.length === 0 && unread === 0) {
        toast.success(summary.join(' · '))
        onDataChanged()
        onOpenChange(false)
        resetState()
        return
      }

      setRows(remaining)
      setSelectedRows(nextSelected)
      setFailures(nextFailures)
      setAttempt((prev) => ({
        number: (prev?.number ?? 0) + 1,
        imported: outcome.imported,
        skipped: outcome.skipped,
        failed: outcome.failed.length,
      }))
      // The attempt summary above the rows reports this; a toast would repeat it over the footer.
      if (outcome.imported > 0) onDataChanged()
    } catch (error) {
      toast.error(`Import stopped: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      inFlightRef.current = false
      setIsImporting(false)
    }
  }

  const handleClose = (next: boolean) => {
    if (!next && inFlightRef.current) return
    if (!next) resetState()
    onOpenChange(next)
  }

  const toggleRow = (row: number) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(row)) next.delete(row)
      else next.add(row)
      return next
    })
  }

  const toggleAll = () => {
    setSelectedRows((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.row))
    )
  }

  const mappingCheck: ParseCheck | null =
    csv && mappingParse
      ? {
          ready: mappingParse.subscriptions.length,
          total: csv.records.rows.length,
          errors: mappingParse.errors,
        }
      : null

  const selectedCount = selectedRows.size
  const isRetry = attempt !== null
  // "Skip duplicates" leaves those rows out, so the button counts only what will be written.
  let skipCount = 0
  if (duplicateMode === 'skip') {
    for (const row of duplicateKinds.keys()) if (selectedRows.has(row)) skipCount++
  }
  const importCount = selectedCount - skipCount

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import subscriptions</DialogTitle>
          <DialogDescription className="text-pretty">
            {step === 'upload' &&
              'Add subscriptions from a CSV file, a Kessai backup, or a Wallos export.'}
            {step === 'mapping' &&
              'Match the columns, then check how amounts and dates are written.'}
            {step === 'preview' &&
              (!isRetry
                ? 'Choose which rows to import and how to handle duplicates.'
                : rows.length > 0
                  ? 'Some rows did not import. Review the reasons, then retry.'
                  : 'Import finished, but not every row in the file was imported.')}
          </DialogDescription>
        </DialogHeader>

        <ImportDialogBody step={attempt ? `${step}-${attempt.number}` : step}>
          {step === 'upload' && (
            <UploadStep
              isReading={isReading}
              errors={uploadErrors}
              onFile={(file) => void processFile(file)}
            />
          )}

          {step === 'mapping' && csv && (
            <MappingStep
              records={csv.records}
              autoMatch={autoMatch}
              mapping={columnMapping}
              onMappingChange={setColumnMapping}
              amountFormat={amountFormat}
              detectedAmount={detectedAmount}
              amountSamples={amountValues.slice(0, 3)}
              onAmountFormatChange={setAmountFormat}
              dateFormat={dateFormat}
              dateReading={dateReading}
              dateMapped={dateColumn !== undefined}
              onDateFormatChange={setDateFormat}
              check={mappingCheck}
            />
          )}

          {step === 'preview' && parseResult && (
            <PreviewStep
              result={parseResult}
              rows={rows}
              selectedRows={selectedRows}
              failures={failures}
              attempt={attempt}
              duplicateKinds={duplicateKinds}
              duplicateMode={duplicateMode}
              missingCategories={missingCategories}
              missingCategoryMode={missingCategory}
              currency={currency}
              disabled={isImporting}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onDuplicateModeChange={setDuplicateMode}
              onMissingCategoryModeChange={setMissingCategory}
            />
          )}
        </ImportDialogBody>

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={() => handleClose(false)} disabled={isReading}>
              Cancel
            </Button>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="outline" onClick={() => setStep('upload')} className="sm:mr-auto">
                <ArrowLeft aria-hidden="true" />
                Back
              </Button>
              <Button onClick={handleMappingComplete} disabled={!mappingCheck?.ready}>
                Preview import
              </Button>
            </>
          )}

          {step === 'preview' && parseResult && (
            <>
              {isRetry ? (
                <Button
                  variant="outline"
                  onClick={() => handleClose(false)}
                  disabled={isImporting}
                  className={rows.length > 0 ? 'sm:mr-auto' : undefined}
                >
                  Close
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setStep(csv ? 'mapping' : 'upload')}
                  disabled={isImporting}
                  className="sm:mr-auto"
                >
                  <ArrowLeft aria-hidden="true" />
                  Back
                </Button>
              )}
              {rows.length > 0 && (
                <Button
                  onClick={handleImport}
                  disabled={isImporting || selectedCount === 0 || (!isRetry && importCount === 0)}
                  aria-busy={isImporting || undefined}
                >
                  {isImporting ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : isRetry ? (
                    <RotateCw aria-hidden="true" />
                  ) : (
                    <Check aria-hidden="true" />
                  )}
                  {isRetry
                    ? `Retry ${plural(selectedCount, 'failed row')}`
                    : selectedCount > 0 && importCount === 0
                      ? 'Nothing new to import'
                      : `Import ${plural(importCount, 'subscription')}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Upload Step ────────────────────────────────────────────────────────

const SUPPORTED_FORMATS = [
  {
    title: 'CSV',
    description:
      'Comma, semicolon, or tab separated, with a header row. Kessai matches name, amount, currency, billing_cycle, category, and start_date columns.',
  },
  { title: 'Kessai backup', description: 'A JSON export from Settings → Data & Backup.' },
  { title: 'Wallos', description: 'A JSON export from the Wallos subscription tracker.' },
] as const

function UploadStep({
  isReading,
  errors,
  onFile,
}: {
  isReading: boolean
  errors: string[]
  onFile: (file: File) => void
}) {
  return (
    <div className="flex flex-col gap-6 pb-3">
      <FileDropzone
        label="Choose import file"
        accept=".csv,.json,text/csv,application/json"
        icon={FileUp}
        title="CSV file, Kessai backup, or Wallos export"
        description="CSV or JSON, up to 10 MB."
        buttonLabel="Choose file"
        busy={isReading}
        busyText="Reading the file…"
        invalid={errors.length > 0}
        onFile={onFile}
      />

      {errors.length > 0 && (
        <RowIssueList
          tone="danger"
          role="alert"
          title="No subscriptions could be read from this file"
          errors={errors}
        />
      )}

      <ImportSection title="Supported files">
        <dl className="divide-border border-border divide-y rounded-lg border">
          {SUPPORTED_FORMATS.map((format) => (
            <div
              key={format.title}
              className="grid gap-1 px-3 py-2.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
            >
              <dt className="text-foreground text-sm font-medium">{format.title}</dt>
              <dd className="text-muted-foreground text-xs leading-relaxed text-pretty sm:pt-0.5">
                {format.description}
              </dd>
            </div>
          ))}
        </dl>
      </ImportSection>
    </div>
  )
}

// ── Mapping Step ───────────────────────────────────────────────────────

function MappingStep({
  records,
  autoMatch,
  mapping,
  onMappingChange,
  amountFormat,
  detectedAmount,
  amountSamples,
  onAmountFormatChange,
  dateFormat,
  dateReading,
  dateMapped,
  onDateFormatChange,
  check,
}: {
  records: CSVRecords
  autoMatch: AutoMatch
  mapping: Record<string, number>
  onMappingChange: (mapping: Record<string, number>) => void
  amountFormat: AmountFormat
  detectedAmount: DetectedAmountFormat | null
  amountSamples: string[]
  onAmountFormatChange: (format: AmountFormat) => void
  dateFormat: DateFormat
  dateReading: DateColumnReading | null
  dateMapped: boolean
  onDateFormatChange: (format: DateFormat) => void
  check: ParseCheck | null
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
    <div className="flex flex-col gap-7 pb-3">
      <ImportSection
        title="Columns"
        description={
          <MappingIntro matched={autoMatch.count} requiredMatched={autoMatch.required} />
        }
      >
        <ColumnMappingFields
          fields={MAPPABLE_FIELDS}
          headers={records.headers}
          rows={records.rows}
          mapping={mapping}
          onChange={updateMapping}
        />
      </ImportSection>

      <ImportSection title="Formats">
        <FormatFields
          amountFormat={amountFormat}
          detectedAmount={detectedAmount}
          amountSamples={amountSamples}
          onAmountFormatChange={onAmountFormatChange}
          dateFormat={dateFormat}
          dateReading={dateReading}
          dateMapped={dateMapped}
          dateUnmappedText="No start date column mapped; each next payment defaults to today."
          onDateFormatChange={onDateFormatChange}
        />
      </ImportSection>

      <ImportSection title="Rows">
        <ParseCheckPanel check={check} />
      </ImportSection>
    </div>
  )
}

function ParseCheckPanel({ check }: { check: ParseCheck | null }) {
  if (!check) {
    return (
      <p className="text-muted-foreground text-sm" aria-live="polite">
        Map Name and Amount, and settle the amount format, to check your rows.
      </p>
    )
  }

  const issues = check.errors.length
  return (
    <div className="flex flex-col gap-3">
      <p className="text-foreground text-sm" aria-live="polite">
        <span className="font-[family-name:var(--font-mono)] font-bold tabular-nums">
          {check.ready} of {check.total}
        </span>{' '}
        rows ready to preview
      </p>
      {check.ready === 0 && (
        <p className="text-destructive text-xs font-medium">
          No row can be imported yet. Adjust the columns or formats above.
        </p>
      )}
      {issues > 0 && (
        <RowIssueList
          title={`${plural(issues, 'row')} ${issues === 1 ? 'needs' : 'need'} attention`}
          errors={check.errors}
          hint="These rows are left out of the preview. Adjust the columns or formats to include them."
        />
      )}
    </div>
  )
}

// ── Preview Step ───────────────────────────────────────────────────────

const DUPLICATE_OPTIONS = [
  { value: 'skip', label: 'Skip duplicates' },
  { value: 'rename', label: 'Rename & import' },
] as const satisfies readonly { value: DuplicateMode; label: string }[]

const CATEGORY_OPTIONS = [
  { value: 'ignore', label: 'Leave uncategorized' },
  { value: 'create', label: 'Create missing' },
] as const satisfies readonly { value: MissingCategoryMode; label: string }[]

const SOURCE_LABELS: Record<ParseResult['source'], string> = {
  csv: 'CSV',
  'kessai-json': 'Kessai backup',
  'wallos-json': 'Wallos',
  unknown: 'Unknown',
}

function PreviewStep({
  result,
  rows,
  selectedRows,
  failures,
  attempt,
  duplicateKinds,
  duplicateMode,
  missingCategories,
  missingCategoryMode,
  currency,
  disabled,
  onToggleRow,
  onToggleAll,
  onDuplicateModeChange,
  onMissingCategoryModeChange,
}: {
  result: ParseResult
  rows: SubscriptionImportRow[]
  selectedRows: Set<number>
  failures: Map<number, string>
  attempt: AttemptSummary | null
  duplicateKinds: Map<number, DuplicateKind>
  duplicateMode: DuplicateMode
  missingCategories: Map<string, string>
  missingCategoryMode: MissingCategoryMode
  currency: CurrencyCode
  disabled: boolean
  onToggleRow: (row: number) => void
  onToggleAll: () => void
  onDuplicateModeChange: (mode: DuplicateMode) => void
  onMissingCategoryModeChange: (mode: MissingCategoryMode) => void
}) {
  let existingCount = 0
  let repeatCount = 0
  for (const [row, kind] of duplicateKinds) {
    if (!selectedRows.has(row)) continue
    if (kind === 'exists') existingCount++
    else repeatCount++
  }
  const duplicateCount = existingCount + repeatCount
  const missingNames = [...missingCategories.values()]
  const hasPolicies = duplicateCount > 0 || missingNames.length > 0

  return (
    <div className="flex flex-col gap-6 pb-3">
      {/* After an attempt that left nothing to retry, "0 failed rows" adds nothing to the
          outcome notice; the count only describes rows still on screen. */}
      {attempt && rows.length === 0 ? null : (
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <Badge variant="secondary">{SOURCE_LABELS[result.source]}</Badge>
          <span>
            {plural(rows.length, attempt ? 'failed row' : 'row')}
            {rows.length > 0 ? ` · ${selectedRows.size} selected` : ''}
          </span>
        </p>
      )}

      {attempt && <AttemptOutcome attempt={attempt} rowsLeft={rows.length} />}

      {result.errors.length > 0 && (
        <RowIssueList
          title={
            result.errors.length === 1
              ? '1 row could not be read and will not be imported'
              : `${result.errors.length} rows could not be read and will not be imported`
          }
          errors={result.errors}
        />
      )}

      {hasPolicies && (
        <div className="grid gap-5 sm:grid-cols-2">
          {duplicateCount > 0 && (
            <ChoiceGroup
              label={`${plural(duplicateCount, 'duplicate')} found`}
              hint={`${[
                existingCount > 0 && `${existingCount} already in Kessai`,
                repeatCount > 0 && `${repeatCount} repeated in this file`,
              ]
                .filter(Boolean)
                .join(', ')}. ${
                duplicateMode === 'skip'
                  ? 'They will be skipped.'
                  : 'They import with an "(imported)" suffix.'
              }`}
              value={duplicateMode}
              options={DUPLICATE_OPTIONS}
              disabled={disabled}
              onChange={onDuplicateModeChange}
            />
          )}

          {missingNames.length > 0 && (
            <ChoiceGroup
              label={`${missingNames.length} ${missingNames.length === 1 ? 'category' : 'categories'} not found`}
              hint={
                <>
                  <span className="text-foreground">{missingNames.join(', ')}</span>
                  {missingCategoryMode === 'create'
                    ? ' will be created before these rows import.'
                    : ' will be dropped; those rows import without a category.'}
                </>
              }
              value={missingCategoryMode}
              options={CATEGORY_OPTIONS}
              disabled={disabled}
              onChange={onMissingCategoryModeChange}
            />
          )}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          size="compact"
          headingLevel="h3"
          icon={ListChecks}
          title="Nothing left to import"
          description="Every selected row was imported or skipped. Fix the unreadable rows in the file and import it again to bring them in."
        />
      ) : (
        <ImportRowsList
          rows={rows}
          selectedRows={selectedRows}
          failures={failures}
          duplicateKinds={duplicateKinds}
          missingCategories={missingCategories}
          missingCategoryMode={missingCategoryMode}
          currency={currency}
          disabled={disabled}
          onToggleRow={onToggleRow}
          onToggleAll={onToggleAll}
        />
      )}
    </div>
  )
}

/**
 * Rows share one DOM at every width. Below `md` a row stacks (name and amount, then row number,
 * cycle, and category); from `md` the same cells line up as columns under the header.
 */
const ROW_COLUMNS =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 md:grid-cols-[1.25rem_2rem_minmax(0,1fr)_5.5rem_9.5rem_5.5rem]'

function ImportRowsList({
  rows,
  selectedRows,
  failures,
  duplicateKinds,
  missingCategories,
  missingCategoryMode,
  currency,
  disabled,
  onToggleRow,
  onToggleAll,
}: {
  rows: SubscriptionImportRow[]
  selectedRows: Set<number>
  failures: Map<number, string>
  duplicateKinds: Map<number, DuplicateKind>
  missingCategories: Map<string, string>
  missingCategoryMode: MissingCategoryMode
  currency: CurrencyCode
  disabled: boolean
  onToggleRow: (row: number) => void
  onToggleAll: () => void
}) {
  const selected = selectedRows.size
  const selectAllId = useId()

  return (
    <div className="border-border overflow-hidden rounded-lg border">
      <div
        className={cn(
          ROW_COLUMNS,
          'border-border items-center border-b bg-[var(--color-subtle-overlay)] px-3 py-2'
        )}
      >
        <label
          htmlFor={selectAllId}
          className="col-span-2 flex cursor-pointer items-center gap-3 md:col-span-1 pointer-coarse:min-h-11"
        >
          <SelectionCheckbox
            id={selectAllId}
            checked={rows.length > 0 && selected === rows.length}
            indeterminate={selected > 0 && selected < rows.length}
            disabled={disabled}
            onChange={onToggleAll}
          />
          <span className="text-foreground text-sm md:sr-only">Select all</span>
        </label>
        <span className="type-label text-muted-foreground text-right md:hidden">
          {selected} of {rows.length} selected
        </span>
        {(['Row', 'Name', 'Cycle', 'Category'] as const).map((heading) => (
          <span
            key={heading}
            aria-hidden="true"
            className="type-label text-muted-foreground hidden md:block"
          >
            {heading}
          </span>
        ))}
        <span
          aria-hidden="true"
          className="type-label text-muted-foreground hidden text-right md:block"
        >
          Amount
        </span>
      </div>

      <ul className="divide-border divide-y">
        {rows.map((sub) => {
          const isSelected = selectedRows.has(sub.row)
          const duplicate = duplicateKinds.get(sub.row)
          const failure = failures.get(sub.row)
          const categoryKey = sub.category_name ? nameKey(sub.category_name) : ''
          const categoryMissing = isSelected && missingCategories.has(categoryKey)

          return (
            <li key={`row-${sub.row}`}>
              <label
                className={cn(
                  ROW_COLUMNS,
                  'cursor-pointer items-start gap-y-1.5 px-3 py-3 transition-colors duration-150 hover:bg-[var(--color-subtle-overlay)] has-[:disabled]:cursor-not-allowed md:items-center pointer-coarse:min-h-11'
                )}
              >
                <SelectionCheckbox
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => onToggleRow(sub.row)}
                  aria-label={`Select row ${sub.row}: ${sub.name}`}
                  className="row-span-2 mt-px md:row-span-1 md:mt-0"
                />

                <span className="col-start-2 row-start-1 flex min-w-0 flex-col gap-1 md:col-start-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        'text-sm font-medium break-words',
                        isSelected ? 'text-foreground' : 'text-muted-foreground'
                      )}
                    >
                      {sub.name}
                    </span>
                    {failure && (
                      <Badge variant="danger" size="sm">
                        Failed
                      </Badge>
                    )}
                    {duplicate && (
                      <Badge variant="warning" size="sm">
                        {duplicate === 'exists' ? 'Exists' : 'Repeated'}
                      </Badge>
                    )}
                  </span>
                  {failure && (
                    <span className="text-destructive text-xs font-medium break-words">
                      {failure}
                    </span>
                  )}
                </span>

                {/* Stacked: one wrapping "row · cycle · category" line. Wide: three cells. */}
                <span className="col-span-2 col-start-2 row-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 md:contents">
                  <span className="type-label text-muted-foreground tabular-nums md:col-start-2 md:row-start-1">
                    <span className="md:sr-only">Row </span>
                    {sub.row}
                  </span>
                  <span className="type-label text-muted-foreground md:col-start-4 md:row-start-1">
                    {BILLING_CYCLE_LABELS[sub.billing_cycle as BillingCycle] || sub.billing_cycle}
                  </span>
                  <span className="text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs md:col-start-5 md:row-start-1">
                    <span className="break-words">{sub.category_name || 'No category'}</span>
                    {categoryMissing && (
                      <Badge variant="secondary" size="sm">
                        {missingCategoryMode === 'create' ? 'New' : 'Not found'}
                      </Badge>
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    'col-start-3 row-start-1 text-right font-[family-name:var(--font-mono)] text-sm font-bold tabular-nums md:col-start-6',
                    isSelected ? 'text-foreground' : 'text-muted-foreground'
                  )}
                >
                  {formatCurrency(sub.amount, (sub.currency as CurrencyCode) || currency)}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// Unreadable rows are reported once, by the warning directly below this notice.
function AttemptOutcome({ attempt, rowsLeft }: { attempt: AttemptSummary; rowsLeft: number }) {
  const failed = attempt.failed > 0
  const attempted = attempt.imported + attempt.skipped + attempt.failed
  const summary = [`Imported ${attempt.imported} of ${attempted}`]
  if (attempt.skipped > 0) summary.push(skippedAsDuplicates(attempt.skipped))
  if (failed) summary.push(`${attempt.failed} failed`)
  // Only a retry needs telling apart from the first try.
  const prefix = attempt.number > 1 ? `Attempt ${attempt.number}: ` : ''

  return (
    <ImportNotice
      role={failed ? 'alert' : 'status'}
      tone={failed ? 'danger' : 'success'}
      title={
        failed
          ? `${prefix}${plural(attempt.failed, 'row')} failed to import`
          : `${prefix}${summary.join(' · ')}`
      }
    >
      {failed && <p className="text-foreground text-sm tabular-nums">{summary.join(' · ')}</p>}
      <p className="text-muted-foreground text-xs leading-relaxed">
        Imported and skipped rows are done and won&rsquo;t be sent again.
        {rowsLeft > 0 && ' Retry sends only the selected rows below.'}
      </p>
    </ImportNotice>
  )
}
