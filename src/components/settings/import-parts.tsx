import * as React from 'react'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Minus,
  TriangleAlert,
} from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { FieldHint } from '@/components/ui/field'
import { fieldClassName } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { AmountFormat, DateFormat } from '@/lib/csv-parser'
import {
  AMOUNT_FORMAT_LABELS,
  DATE_ORDER_LABELS,
  amountAutoLabel,
  amountFormatHint,
  columnSamples,
  dateAutoLabel,
  dateFormatHint,
  plural,
  type DateColumnReading,
  type DetectedAmountFormat,
  type FormatHint,
} from './import-formats'

/** Building blocks shared by the CSV wizard and the structured import dialog. */

type IconComponent = React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>

// ── Dialog body ──────────────────────────────────────────────────────

/**
 * The scrolling middle of an import dialog: header and footer stay put while this scrolls.
 * Hairlines mark an edge only while content continues past it; on phones the content also
 * fades into the edge, since the thin scrollbar alone is easy to miss. A new `step` starts
 * at the top instead of inheriting the previous step's scroll position.
 */
export function ImportDialogBody({ step, children }: { step: string; children: React.ReactNode }) {
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [edges, setEdges] = React.useState({ top: false, bottom: false })

  React.useLayoutEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [step])

  React.useEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const update = () => {
      const top = scroller.scrollTop > 1
      const bottom = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 1
      setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(scroller)
    observer?.observe(content)
    return () => {
      scroller.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [])

  return (
    <div
      ref={scrollRef}
      data-more-above={edges.top || undefined}
      data-more-below={edges.bottom || undefined}
      className="data-[more-above]:border-t-border data-[more-below]:border-b-border -mx-6 min-h-0 flex-1 overflow-y-auto overscroll-contain border-y border-transparent px-6 transition-[border-color] duration-150 [--fade-bottom:0px] [--fade-top:0px] data-[more-above]:[--fade-top:1rem] data-[more-below]:[--fade-bottom:2.5rem] max-md:[mask-image:linear-gradient(to_bottom,transparent,#000_var(--fade-top),#000_calc(100%_-_var(--fade-bottom)),transparent)]"
    >
      <div ref={contentRef} className="py-1">
        {children}
      </div>
    </div>
  )
}

/** A titled group inside a step; the heading follows the dialog title's `h2`. */
export function ImportSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const id = React.useId()
  return (
    <section aria-labelledby={id} className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-col gap-1.5">
        <h3 id={id} className="type-label text-muted-foreground font-normal">
          {title}
        </h3>
        {description}
      </div>
      {children}
    </section>
  )
}

// ── File picking ─────────────────────────────────────────────────────

interface FileDropzoneProps {
  /** Accessible name of the file input. */
  label: string
  accept: string
  icon: IconComponent
  title: string
  description: string
  buttonLabel: string
  busy?: boolean
  busyText?: string
  /** Ids of hint or error text that describe the input. */
  describedBy?: string
  invalid?: boolean
  onFile: (file: File) => void
}

/**
 * A native file input inside its label: the whole panel opens the picker, the input keeps
 * keyboard focus (ring drawn on the panel), and files dropped on the panel are read too.
 */
export function FileDropzone({
  label,
  accept,
  icon: Icon,
  title,
  description,
  buttonLabel,
  busy = false,
  busyText,
  describedBy,
  invalid = false,
  onFile,
}: FileDropzoneProps) {
  const inputId = React.useId()
  const [dragging, setDragging] = React.useState(false)

  return (
    <label
      htmlFor={inputId}
      data-dragging={dragging || undefined}
      onDragOver={(e) => {
        e.preventDefault()
        if (!busy) setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file && !busy) onFile(file)
      }}
      className={cn(
        'group border-border-hover flex cursor-pointer flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-8 text-center transition-[border-color,background-color] duration-150',
        'hover:border-foreground/40 data-[dragging]:border-foreground data-[dragging]:bg-accent-muted hover:bg-[var(--color-subtle-overlay)]',
        'has-[input:focus-visible]:outline-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-solid',
        'has-[input:disabled]:cursor-progress',
        invalid && 'border-destructive/60'
      )}
    >
      <input
        id={inputId}
        type="file"
        accept={accept}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        aria-busy={busy || undefined}
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Clear the input so choosing the same file again still fires a change.
          e.target.value = ''
          if (file) onFile(file)
        }}
      />
      <span className="border-border-hover bg-accent-muted text-foreground flex size-12 items-center justify-center rounded-md border">
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="size-5" aria-hidden={true} />
        )}
      </span>
      <span className="flex max-w-[40ch] flex-col gap-1">
        <span className="text-foreground text-sm font-medium text-balance">
          {busy && busyText ? busyText : dragging ? 'Drop to read this file' : title}
        </span>
        <span className="text-muted-foreground text-xs leading-relaxed">{description}</span>
      </span>
      <span className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <span aria-hidden="true" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
          {buttonLabel}
        </span>
        <span aria-hidden="true" className="text-muted-foreground text-xs pointer-coarse:hidden">
          or drop it here
        </span>
      </span>
      <span role="status" className="sr-only">
        {busy && busyText ? busyText : ''}
      </span>
    </label>
  )
}

// ── Controls ─────────────────────────────────────────────────────────

/**
 * Native select in the shared field chrome: phones get the platform picker, keyboards get
 * type-ahead. `className` sizes the wrapper; the select always fills it.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.ComponentProps<'select'> & { compact?: boolean }
>(({ className, compact = false, children, ...props }, ref) => (
  <div className={cn('relative min-w-0', className)}>
    <select
      ref={ref}
      className={cn(
        fieldClassName,
        'block cursor-pointer appearance-none truncate pr-9 pl-3 text-base md:text-sm',
        '[&>option]:bg-popover [&>option]:text-popover-foreground',
        compact ? 'h-9' : 'h-10'
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown
      aria-hidden="true"
      className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
    />
  </div>
))
NativeSelect.displayName = 'NativeSelect'

/** 20px checkbox; pair it with a label or row that gives it a 44px target on touch. */
export function SelectionCheckbox({
  indeterminate = false,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { indeterminate?: boolean }) {
  const ref = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <span className={cn('relative inline-flex size-5 shrink-0', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer border-input-border bg-input hover:border-border-hover checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary size-5 cursor-pointer appearance-none rounded-sm border transition-[border-color,background-color] duration-150 disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="text-primary-foreground pointer-events-none absolute inset-0 m-auto size-3.5 opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
      />
      <Minus
        aria-hidden="true"
        strokeWidth={3}
        className="text-primary-foreground pointer-events-none absolute inset-0 m-auto size-3.5 opacity-0 peer-indeterminate:opacity-100"
      />
    </span>
  )
}

/** One-of-many choice as pressed outline buttons, named by a visible label. */
export function ChoiceGroup<T extends string>({
  label,
  hint,
  value,
  options,
  disabled = false,
  onChange,
}: {
  label: string
  hint: React.ReactNode
  value: T
  options: readonly { value: T; label: string }[]
  disabled?: boolean
  onChange: (value: T) => void
}) {
  const id = React.useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <span id={`${id}-label`} className="text-foreground text-sm leading-snug font-medium">
        {label}
      </span>
      <div
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        className="flex flex-wrap gap-2"
      >
        {options.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            size="sm"
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <FieldHint id={`${id}-hint`} className="text-pretty">
        {hint}
      </FieldHint>
    </div>
  )
}

// ── Notices ──────────────────────────────────────────────────────────

const NOTICE_TONES = {
  danger: {
    box: 'border-destructive/30 bg-destructive/5',
    icon: 'text-destructive',
    Icon: AlertCircle,
  },
  warning: { box: 'border-warning/30 bg-warning/5', icon: 'text-warning', Icon: TriangleAlert },
  success: { box: 'border-success/30 bg-success/5', icon: 'text-success', Icon: CheckCircle2 },
} as const

/** Tinted callout for an outcome the step reports: unreadable rows, failed or finished writes. */
export function ImportNotice({
  tone,
  title,
  role,
  children,
}: {
  tone: keyof typeof NOTICE_TONES
  title: React.ReactNode
  role?: 'alert' | 'status'
  children?: React.ReactNode
}) {
  const { box, icon, Icon } = NOTICE_TONES[tone]
  return (
    <div role={role} className={cn('flex items-start gap-3 rounded-lg border p-3', box)}>
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', icon)} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="text-foreground text-sm leading-snug font-medium">{title}</p>
        {children}
      </div>
    </div>
  )
}

const ISSUE_PREVIEW_COUNT = 5
const ISSUE_LIST_LIMIT = 100

/**
 * Row-level parse messages. The first few show at once; the rest open in place instead of
 * in a nested scroller, which is hard to use on a phone inside a scrolling dialog.
 */
export function RowIssueList({
  title,
  errors,
  hint,
  tone = 'warning',
  role,
}: {
  title: string
  errors: readonly string[]
  hint?: string
  tone?: keyof typeof NOTICE_TONES
  role?: 'alert'
}) {
  const listId = React.useId()
  const [expanded, setExpanded] = React.useState(false)
  const listed = errors.slice(0, expanded ? ISSUE_LIST_LIMIT : ISSUE_PREVIEW_COUNT)
  const unlisted = errors.length - listed.length
  const expandable = errors.length > ISSUE_PREVIEW_COUNT

  return (
    <ImportNotice tone={tone} title={title} role={role}>
      <ul id={listId} className="flex flex-col gap-1">
        {listed.map((error, i) => (
          <li
            key={`${i}-${error}`}
            className="text-muted-foreground text-xs leading-relaxed break-words"
          >
            {error}
          </li>
        ))}
      </ul>
      {expanded && unlisted > 0 ? (
        <p className="text-muted-foreground text-xs">{plural(unlisted, 'more row')} not listed.</p>
      ) : null}
      {expandable ? (
        <Button
          variant="link"
          size="sm"
          className="self-start"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded
            ? 'Show fewer'
            : errors.length > ISSUE_LIST_LIMIT
              ? `Show the first ${ISSUE_LIST_LIMIT}`
              : `Show all ${errors.length}`}
        </Button>
      ) : null}
      {hint ? <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p> : null}
    </ImportNotice>
  )
}

// ── Column mapping ───────────────────────────────────────────────────

const SAMPLE_LENGTH = 24

function clip(value: string) {
  return value.length > SAMPLE_LENGTH ? `${value.slice(0, SAMPLE_LENGTH - 1)}…` : value
}

/** Columns paired with what Kessai needs; each option carries a sample value from the file. */
export function ColumnMappingFields<K extends string>({
  fields,
  headers,
  rows,
  mapping,
  onChange,
}: {
  fields: readonly { key: K; label: string; required: boolean }[]
  headers: readonly string[]
  rows: readonly string[][]
  mapping: Partial<Record<K, number>>
  onChange: (key: K, column: number | undefined) => void
}) {
  const idPrefix = React.useId()
  const columns = React.useMemo(
    () =>
      headers.map((header, i) => {
        const name = header.trim() || `Column ${i + 1}`
        const sample = columnSamples(rows, i, 1)[0]
        return sample && sample !== name ? `${name} (${clip(sample)})` : name
      }),
    [headers, rows]
  )

  return (
    <div className="flex flex-col gap-3">
      {fields.map((field) => {
        const id = `${idPrefix}-${field.key}`
        const column = mapping[field.key]
        return (
          <div
            key={field.key}
            className="grid gap-2 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-4"
          >
            <div className="flex items-baseline gap-2">
              <Label htmlFor={id}>{field.label}</Label>
              {field.required ? (
                <span className="type-label text-muted-foreground">Required</span>
              ) : null}
            </div>
            <NativeSelect
              id={id}
              aria-required={field.required || undefined}
              value={column === undefined ? '' : String(column)}
              onChange={(e) =>
                onChange(field.key, e.target.value === '' ? undefined : Number(e.target.value))
              }
            >
              <option value="">Not mapped</option>
              {columns.map((label, i) => (
                <option key={`${i}-${label}`} value={i}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </div>
        )
      })}
    </div>
  )
}

/** States how many columns were matched from the headers, or that the user must choose. */
export function MappingIntro({
  matched,
  requiredMatched,
}: {
  matched: number
  requiredMatched: boolean
}) {
  if (requiredMatched) {
    return (
      <FieldHint>
        Matched {plural(matched, 'column')} by header name. Check them before continuing.
      </FieldHint>
    )
  }
  return (
    <FieldHint className="text-warning flex items-start gap-1.5">
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      Couldn&rsquo;t find the Name and Amount columns from the headers. Choose them below.
    </FieldHint>
  )
}

// ── Formats ──────────────────────────────────────────────────────────

interface FormatOption<T extends string> {
  value: T
  label: string
}

function FormatField<T extends string>({
  id,
  label,
  value,
  options,
  hint,
  disabled = false,
  onChange,
}: {
  id: string
  label: string
  value: T
  options: readonly FormatOption<T>[]
  hint: FormatHint
  disabled?: boolean
  onChange: (value: T) => void
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value}
        disabled={disabled}
        aria-describedby={`${id}-hint`}
        onChange={(e) => {
          const next = options.find((option) => option.value === e.target.value)
          if (next) onChange(next.value)
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldHint
        id={`${id}-hint`}
        className={cn('flex items-start gap-1.5 text-pretty', hint.warn && 'text-warning')}
      >
        {hint.warn ? (
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        ) : null}
        {hint.text}
      </FieldHint>
    </div>
  )
}

/** Amount and date formats: the detected reading is the "Auto" choice; either can be overridden. */
export function FormatFields({
  amountFormat,
  detectedAmount,
  amountSamples,
  onAmountFormatChange,
  dateFormat,
  dateReading,
  dateMapped,
  dateUnmappedText,
  onDateFormatChange,
}: {
  amountFormat: AmountFormat
  detectedAmount: DetectedAmountFormat | null
  amountSamples: readonly string[]
  onAmountFormatChange: (format: AmountFormat) => void
  dateFormat: DateFormat
  dateReading: DateColumnReading | null
  dateMapped: boolean
  dateUnmappedText: string
  onDateFormatChange: (format: DateFormat) => void
}) {
  const id = React.useId()
  const samples = [...new Set(amountSamples)].slice(0, 2).map((sample) => `"${sample}"`)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormatField<AmountFormat>
        id={`${id}-amount`}
        label="Amount format"
        value={amountFormat}
        options={[
          { value: 'auto', label: amountAutoLabel(detectedAmount) },
          { value: 'decimal-dot', label: AMOUNT_FORMAT_LABELS['decimal-dot'] },
          { value: 'decimal-comma', label: AMOUNT_FORMAT_LABELS['decimal-comma'] },
        ]}
        hint={amountFormatHint(detectedAmount, amountFormat, samples)}
        onChange={onAmountFormatChange}
      />
      <FormatField<DateFormat>
        id={`${id}-date`}
        label="Date format"
        value={dateFormat}
        disabled={!dateMapped}
        options={[
          { value: 'auto', label: dateAutoLabel(dateMapped ? dateReading : null) },
          { value: 'day-first', label: DATE_ORDER_LABELS['day-first'] },
          { value: 'month-first', label: DATE_ORDER_LABELS['month-first'] },
        ]}
        hint={dateFormatHint(dateReading, dateFormat, dateMapped, dateUnmappedText)}
        onChange={onDateFormatChange}
      />
    </div>
  )
}
