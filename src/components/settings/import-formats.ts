import dayjs from 'dayjs'
import { parseImportDate, type AmountFormat, type DateFormat } from '@/lib/csv-parser'
import { DEFAULT_CATEGORY_COLORS } from '@/types/category'

/** Copy and detection shared by the CSV wizard and the structured import dialog. */

/** Categories an import creates start like a hand-made one: the first preset swatch. */
export const NEW_CATEGORY_STYLE = { color: DEFAULT_CATEGORY_COLORS[0], icon: 'folder' } as const

export type ResolvedAmountFormat = Exclude<AmountFormat, 'auto'>
export type DetectedAmountFormat = ResolvedAmountFormat | 'mixed'
type DateOrder = Exclude<DateFormat, 'auto'>

export interface DateColumnReading {
  format: 'iso' | DateOrder | 'mixed' | 'ambiguous'
  /** A slash date that reads both ways (or any slash date), to show what a choice does. */
  sample?: string
  /** The date that settled the order, e.g. 15/01/2026 for DD/MM/YYYY. */
  evidence?: string
}

export interface FormatHint {
  text: string
  warn: boolean
}

export const AMOUNT_FORMAT_LABELS: Record<ResolvedAmountFormat, string> = {
  'decimal-dot': '1,234.56 (decimal point)',
  'decimal-comma': '1.234,56 (decimal comma)',
}

export const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  'day-first': 'DD/MM/YYYY',
  'month-first': 'MM/DD/YYYY',
}

/** Fixed example for files without a slash date to demonstrate the chosen order on. */
const DATE_ORDER_EXAMPLES: Record<DateOrder, string> = {
  'day-first': 'Reading 03/04/2026 as 3 April 2026.',
  'month-first': 'Reading 03/04/2026 as March 4, 2026.',
}

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

/** "1 skipped as a duplicate", "3 skipped as duplicates": the import outcome's skip count. */
export function skippedAsDuplicates(count: number): string {
  return `${count} skipped as ${count === 1 ? 'a duplicate' : 'duplicates'}`
}

/** "Auto" applies the column-wide detection; a column mixing both styles needs a choice. */
export function resolveAmountFormat(
  selected: AmountFormat,
  detected: DetectedAmountFormat | null
): ResolvedAmountFormat | null {
  if (selected !== 'auto') return selected
  return detected === 'mixed' ? null : detected
}

export function amountAutoLabel(detected: DetectedAmountFormat | null): string {
  if (detected === null) return 'Auto-detect'
  if (detected === 'mixed') return 'Auto (mixed, choose one)'
  return `Auto: ${AMOUNT_FORMAT_LABELS[detected]}`
}

export function amountFormatHint(
  detected: DetectedAmountFormat | null,
  selected: AmountFormat,
  samples: readonly string[]
): FormatHint {
  if (detected === null) return { text: 'Map the Amount column to detect its format.', warn: false }
  if (detected === 'mixed') {
    return selected === 'auto'
      ? {
          text: 'This column mixes 1,234.56 and 1.234,56 styles. Choose the one your bank uses.',
          warn: true,
        }
      : {
          text: `This column mixes both styles; reading every amount as ${AMOUNT_FORMAT_LABELS[selected]}.`,
          warn: false,
        }
  }
  const detectedText = `Detected ${AMOUNT_FORMAT_LABELS[detected]}`
  if (selected !== 'auto' && selected !== detected) {
    return {
      text: `${detectedText}; reading as ${AMOUNT_FORMAT_LABELS[selected]} instead.`,
      warn: false,
    }
  }
  const examples = samples.length > 0 ? ` from values like ${samples.join(' and ')}` : ''
  return { text: `${detectedText}${examples}.`, warn: false }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const SLASH_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

/**
 * Reads a date column the way `parseImportDate` does: a first part above 12 proves day-first,
 * a second part above 12 proves month-first, and anything else on a slash date is ambiguous.
 */
export function detectDateFormat(values: readonly string[]): DateColumnReading | null {
  let iso = false
  let dayEvidence: string | undefined
  let monthEvidence: string | undefined
  let ambiguous: string | undefined
  let slash: string | undefined

  for (const raw of values) {
    const value = raw.trim()
    if (ISO_DATE.test(value)) {
      iso = true
      continue
    }
    const match = SLASH_DATE.exec(value)
    if (!match) continue
    slash ??= value
    const first = Number(match[1])
    const second = Number(match[2])
    if (first > 12) dayEvidence ??= value
    else if (second > 12) monthEvidence ??= value
    else if (first !== second) ambiguous ??= value
  }

  const sample = ambiguous ?? slash
  if (dayEvidence && monthEvidence) return { format: 'mixed', sample }
  if (dayEvidence) return { format: 'day-first', sample, evidence: dayEvidence }
  if (monthEvidence) return { format: 'month-first', sample, evidence: monthEvidence }
  if (ambiguous) return { format: 'ambiguous', sample: ambiguous }
  if (iso) return { format: 'iso' }
  return null
}

/** "Auto" adopts an order the column proves; otherwise each date must read one way only. */
export function resolveDateFormat(
  selected: DateFormat,
  reading: DateColumnReading | null
): DateFormat {
  if (selected !== 'auto') return selected
  return reading?.format === 'day-first' || reading?.format === 'month-first'
    ? reading.format
    : 'auto'
}

export function dateAutoLabel(reading: DateColumnReading | null): string {
  switch (reading?.format) {
    case undefined:
      return 'Auto-detect'
    case 'iso':
      return 'Auto: YYYY-MM-DD'
    case 'day-first':
    case 'month-first':
      return `Auto: ${DATE_ORDER_LABELS[reading.format]}`
    default:
      return 'Auto (choose an order)'
  }
}

function describeReading(sample: string | undefined, order: DateOrder): string {
  if (!sample) return DATE_ORDER_EXAMPLES[order]
  try {
    return `Reading ${sample} as ${dayjs(parseImportDate(sample, order)).format('D MMMM YYYY')}.`
  } catch {
    return DATE_ORDER_EXAMPLES[order]
  }
}

export function dateFormatHint(
  reading: DateColumnReading | null,
  selected: DateFormat,
  mapped: boolean,
  unmappedText: string
): FormatHint {
  if (!mapped) return { text: unmappedText, warn: false }

  const proven =
    reading?.format === 'day-first' || reading?.format === 'month-first' ? reading.format : null

  if (selected !== 'auto') {
    if (proven && proven !== selected) {
      return {
        text: `Detected ${DATE_ORDER_LABELS[proven]}; reading as ${DATE_ORDER_LABELS[selected]} instead.`,
        warn: false,
      }
    }
    return { text: describeReading(reading?.sample, selected), warn: false }
  }

  switch (reading?.format) {
    case undefined:
      return {
        text: 'Reads YYYY-MM-DD and dates whose day is above 12. Pick an order for dates like 03/04/2026.',
        warn: false,
      }
    case 'iso':
      return { text: 'Detected YYYY-MM-DD dates.', warn: false }
    case 'day-first':
    case 'month-first':
      return {
        text: `Detected ${DATE_ORDER_LABELS[reading.format]} from dates like ${reading.evidence}.`,
        warn: false,
      }
    case 'mixed':
      return {
        text: 'Dates appear in both DD/MM and MM/DD order. Choose the order your bank uses.',
        warn: true,
      }
    case 'ambiguous':
      return {
        text: `Dates like ${reading.sample} read both ways. Choose the order your bank uses.`,
        warn: true,
      }
  }
}

/** First few non-empty values of a column, for hints and option labels. */
export function columnSamples(rows: readonly string[][], column: number, limit = 3): string[] {
  const samples: string[] = []
  for (const row of rows) {
    const value = row[column]?.trim()
    if (value) samples.push(value)
    if (samples.length === limit) break
  }
  return samples
}
