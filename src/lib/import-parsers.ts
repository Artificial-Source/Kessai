import { z } from 'zod'
import { billingCycleSchema, type BillingCycle } from '@/types/subscription'
import {
  MAX_IMPORT_ROWS,
  MAX_IMPORT_NAME_LENGTH,
  MAX_IMPORT_NOTES_LENGTH,
  tokenizeCSV,
  parseImportAmount,
  parseImportDate,
  validateImportFields,
  readImportFile,
  type CSVRecords,
  type ImportFormats,
} from './csv-parser'

export interface ParsedSubscription {
  name: string
  amount: number
  currency: string
  billing_cycle: BillingCycle
  category_name?: string
  start_date?: string
  notes?: string
}

export interface ParseResult {
  subscriptions: ParsedSubscription[]
  errors: string[]
  source: 'csv' | 'kessai-json' | 'wallos-json' | 'unknown'
  /** Original one-based record numbers, aligned with subscriptions. CSV includes the header. */
  sourceRows: number[]
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: ['name', 'service', 'subscription', 'title', 'description', 'service_name'],
  amount: ['amount', 'price', 'cost', 'fee', 'value', 'monthly_cost'],
  currency: ['currency', 'currency_code'],
  billing_cycle: [
    'billing_cycle',
    'cycle',
    'frequency',
    'period',
    'billing_period',
    'recurrence',
    'interval',
  ],
  category: ['category', 'category_name', 'group', 'type'],
  start_date: ['start_date', 'started', 'date', 'start', 'created', 'created_at', 'next_payment'],
  notes: ['notes', 'note', 'description', 'memo', 'comment'],
}

function normalizeBillingCycle(value: string): BillingCycle {
  const lower = value.toLowerCase().trim()
  if (['weekly', 'week', 'w'].includes(lower)) return 'weekly'
  if (['quarterly', 'quarter', 'q', '3 months', '3m'].includes(lower)) return 'quarterly'
  if (['yearly', 'year', 'annual', 'annually', 'y', '12 months', '12m', '1 year'].includes(lower))
    return 'yearly'
  if (lower === 'custom') return 'custom'
  return 'monthly'
}

export function findColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const normalized = headers.map((header) =>
    header
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
  )
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const index = normalized.indexOf(alias)
      if (index !== -1) {
        mapping[field] = index
        break
      }
    }
  }
  return mapping
}

function emptyResult(source: ParseResult['source'], error: string): ParseResult {
  return { source, subscriptions: [], errors: [error], sourceRows: [] }
}

export function parseCSV(
  content: string,
  customMapping?: Record<string, number>,
  formats: ImportFormats = {}
): ParseResult {
  let csv: CSVRecords
  try {
    csv = tokenizeCSV(content)
  } catch (error) {
    return emptyResult('csv', error instanceof Error ? error.message : String(error))
  }
  if (!csv.rows.length)
    return emptyResult('csv', 'CSV file must have a header row and at least one data row')
  const mapping = customMapping ?? findColumnMapping(csv.headers)
  if (mapping.name === undefined || mapping.amount === undefined) {
    return emptyResult(
      'csv',
      `Could not find required columns. Found headers: ${csv.headers.join(', ')}. Need at least "name" and "amount" columns.`
    )
  }
  const result: ParseResult = { subscriptions: [], errors: [], source: 'csv', sourceRows: [] }
  for (const [index, fields] of csv.rows.entries()) {
    try {
      const name = fields[mapping.name]?.trim() ?? ''
      const notes = mapping.notes !== undefined ? fields[mapping.notes] || undefined : undefined
      const category =
        mapping.category !== undefined ? fields[mapping.category]?.trim() || undefined : undefined
      validateImportFields(name, notes, category)
      const amount = parseImportAmount(fields[mapping.amount] ?? '', formats.amountFormat)
      if (amount < 0)
        throw new Error(`Invalid amount "${fields[mapping.amount]}"; must be zero or more`)
      const date = mapping.start_date !== undefined ? fields[mapping.start_date]?.trim() : undefined
      result.subscriptions.push({
        name,
        amount,
        currency:
          mapping.currency !== undefined
            ? fields[mapping.currency]?.trim().toUpperCase() || 'USD'
            : 'USD',
        billing_cycle: normalizeBillingCycle(
          mapping.billing_cycle !== undefined
            ? (fields[mapping.billing_cycle] ?? 'monthly')
            : 'monthly'
        ),
        category_name: category,
        start_date: date ? parseImportDate(date, formats.dateFormat) : undefined,
        notes,
      })
      result.sourceRows.push(index + 2)
    } catch (error) {
      result.errors.push(
        `Row ${index + 2}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return result
}

export function getCSVHeaders(content: string): string[] {
  return tokenizeCSV(content).headers
}

const nameSchema = z.string().trim().min(1).max(MAX_IMPORT_NAME_LENGTH)
const notesSchema = z.string().max(MAX_IMPORT_NOTES_LENGTH).nullish()
const categoryNameSchema = z.string().trim().max(50).nullish()
const currencySchema = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase() || 'USD')
  .pipe(z.string().regex(/^[A-Z]{3}$/))
  .optional()
  .default('USD')
const amountSchema = z.union([z.number(), z.string()]).transform((value, context) => {
  try {
    const amount = typeof value === 'number' ? value : parseImportAmount(value)
    if (!Number.isFinite(amount) || amount < 0)
      throw new Error('Amount must be finite and zero or more')
    return amount
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid amount',
    })
    return z.NEVER
  }
})
const dateSchema = z
  .string()
  .transform((value, context) => {
    try {
      return parseImportDate(value)
    } catch (error) {
      context.addIssue({
        code: 'custom',
        message: error instanceof Error ? error.message : 'Invalid date',
      })
      return z.NEVER
    }
  })
  .nullish()

const kessaiRecordSchema = z.object({
  name: nameSchema,
  amount: amountSchema,
  currency: currencySchema,
  billing_cycle: billingCycleSchema,
  category_id: z.string().nullish(),
  next_payment_date: dateSchema,
  notes: notesSchema,
})
const categorySchema = z.object({ id: z.string(), name: z.string().trim().min(1).max(50) })
const kessaiEnvelopeSchema = z.object({
  version: z.string().min(1),
  subscriptions: z.array(z.unknown()).max(MAX_IMPORT_ROWS),
  categories: z.array(z.unknown()).max(1000).optional(),
})
const wallosRecordSchema = z.object({
  name: nameSchema,
  price: amountSchema,
  currency_code: currencySchema,
  cycle: z
    .union([z.number(), z.string()])
    .transform(Number)
    .pipe(z.number().int().min(1).max(4))
    .optional()
    .default(3),
  frequency: z
    .union([z.number(), z.string()])
    .transform(Number)
    .pipe(z.number().int().positive())
    .optional()
    .default(1),
  billing_cycle: billingCycleSchema.optional(),
  category_name: categoryNameSchema,
  next_payment: dateSchema,
  notes: notesSchema,
})
const wallosEnvelopeSchema = z.object({ subscriptions: z.array(z.unknown()).max(MAX_IMPORT_ROWS) })

function recordError(row: number, error: z.ZodError): string {
  return `Row ${row}: ${error.issues.map((issue) => `${issue.path.join('.') || 'record'}: ${issue.message}`).join('; ')}`
}

function wallosCycleToBillingCycle(cycle: number, frequency: number): BillingCycle {
  if (cycle === 2) return 'weekly'
  if (cycle === 3 && frequency === 3) return 'quarterly'
  if (cycle === 4 || (cycle === 3 && frequency === 12)) return 'yearly'
  return 'monthly'
}

export function parseWallosJSON(data: unknown): ParseResult {
  const envelope = wallosEnvelopeSchema.safeParse(data)
  if (!envelope.success)
    return emptyResult(
      'wallos-json',
      'Not a valid Wallos export format (maximum 10000 subscriptions)'
    )
  const result: ParseResult = {
    subscriptions: [],
    errors: [],
    source: 'wallos-json',
    sourceRows: [],
  }
  for (const [index, record] of envelope.data.subscriptions.entries()) {
    const parsed = wallosRecordSchema.safeParse(record)
    if (!parsed.success) {
      result.errors.push(recordError(index + 1, parsed.error))
      continue
    }
    const sub = parsed.data
    result.subscriptions.push({
      name: sub.name,
      amount: sub.price,
      currency: sub.currency_code,
      billing_cycle: sub.billing_cycle ?? wallosCycleToBillingCycle(sub.cycle, sub.frequency),
      category_name: sub.category_name || undefined,
      start_date: sub.next_payment || undefined,
      notes: sub.notes || undefined,
    })
    result.sourceRows.push(index + 1)
  }
  return result
}

export function parseKessaiJSON(data: unknown): ParseResult {
  const envelope = kessaiEnvelopeSchema.safeParse(data)
  if (!envelope.success)
    return emptyResult(
      'kessai-json',
      'Not a valid Kessai backup format (maximum 10000 subscriptions and 1000 categories)'
    )
  const result: ParseResult = {
    subscriptions: [],
    errors: [],
    source: 'kessai-json',
    sourceRows: [],
  }
  const categories = new Map<string, string>()
  for (const [index, record] of (envelope.data.categories ?? []).entries()) {
    const parsed = categorySchema.safeParse(record)
    if (parsed.success) categories.set(parsed.data.id, parsed.data.name)
    else result.errors.push(`Category ${index + 1}: invalid id or name`)
  }
  for (const [index, record] of envelope.data.subscriptions.entries()) {
    const parsed = kessaiRecordSchema.safeParse(record)
    if (!parsed.success) {
      result.errors.push(recordError(index + 1, parsed.error))
      continue
    }
    const sub = parsed.data
    result.subscriptions.push({
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency,
      billing_cycle: sub.billing_cycle,
      category_name: sub.category_id ? categories.get(sub.category_id) : undefined,
      start_date: sub.next_payment_date || undefined,
      notes: sub.notes || undefined,
    })
    result.sourceRows.push(index + 1)
  }
  return result
}

export function detectAndParseJSON(data: unknown): ParseResult {
  if (data && typeof data === 'object' && 'subscriptions' in data) {
    if ('version' in data) return parseKessaiJSON(data)
    if (
      Array.isArray(data.subscriptions) &&
      data.subscriptions.some(
        (record: unknown) =>
          record !== null &&
          typeof record === 'object' &&
          ('price' in record || 'cycle' in record || 'payer_user_id' in record)
      )
    )
      return parseWallosJSON(data)
  }
  return emptyResult('unknown', 'Unknown JSON format. Supported: Kessai backup, Wallos export.')
}

export function readFileAsText(file: File): Promise<string> {
  return readImportFile(file)
}
