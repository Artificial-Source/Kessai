import dayjs from 'dayjs'
import type { BillingCycle } from '@/types/subscription'
import { calculateNextPaymentDate } from './date-utils'
import {
  tokenizeCSV,
  readImportFile,
  parseImportAmount,
  parseImportDate,
  validateImportFields,
  type ImportFormats,
} from './csv-parser'

// ── Types ─────────────────────────────────────────────────────────────

export interface DetectedSubscription {
  name: string
  amount: number
  currency: string
  billing_cycle: BillingCycle
  confidence: number // 0-1 confidence in the detected cycle
  include: boolean
  category_name?: string
  next_payment_date?: string
  notes?: string
  source_rows: number[] // row indices from original CSV
}

export interface CSVParseResult {
  headers: string[]
  rows: string[][]
  delimiter: string
}

export interface ColumnMapping {
  name?: number
  amount?: number
  currency?: number
  billing_cycle?: number
  category?: number
  date?: number
  notes?: number
}

export async function parseCSVFile(file: File): Promise<CSVParseResult> {
  return parseCSVContent(await readImportFile(file))
}

export function parseCSVContent(content: string): CSVParseResult {
  return tokenizeCSV(content)
}

// ── Column Auto-Detection ─────────────────────────────────────────────

const NAME_ALIASES = [
  'name',
  'merchant',
  'description',
  'vendor',
  'payee',
  'service',
  'subscription',
  'title',
  'company',
  'service_name',
  'merchant_name',
  'transaction_description',
  'memo',
]

const AMOUNT_ALIASES = [
  'amount',
  'price',
  'cost',
  'fee',
  'value',
  'total',
  'charge',
  'debit',
  'payment',
  'monthly_cost',
  'sum',
]

const CURRENCY_ALIASES = ['currency', 'currency_code', 'cur', 'ccy']

const CYCLE_ALIASES = [
  'billing_cycle',
  'cycle',
  'frequency',
  'period',
  'billing_period',
  'recurrence',
  'interval',
]

const CATEGORY_ALIASES = ['category', 'category_name', 'group', 'type', 'tag']

const DATE_ALIASES = [
  'date',
  'transaction_date',
  'payment_date',
  'next_payment',
  'start_date',
  'posted_date',
  'booking_date',
  'value_date',
  'created',
  'created_at',
  'trans_date',
]

const NOTES_ALIASES = ['notes', 'note', 'memo', 'comment', 'remarks', 'reference']

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

function findBestMatch(headers: string[], aliases: string[]): number | undefined {
  const normalized = headers.map(normalizeHeader)

  for (const alias of aliases) {
    const index = normalized.indexOf(alias)
    if (index !== -1) return index
  }

  // Partial match: check if any alias is contained in a header
  for (const alias of aliases) {
    const index = normalized.findIndex((h) => h.includes(alias) || alias.includes(h))
    if (index !== -1) return index
  }

  return undefined
}

export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  mapping.name = findBestMatch(headers, NAME_ALIASES)
  mapping.amount = findBestMatch(headers, AMOUNT_ALIASES)
  mapping.currency = findBestMatch(headers, CURRENCY_ALIASES)
  mapping.billing_cycle = findBestMatch(headers, CYCLE_ALIASES)
  mapping.category = findBestMatch(headers, CATEGORY_ALIASES)
  mapping.date = findBestMatch(headers, DATE_ALIASES)
  mapping.notes = findBestMatch(headers, NOTES_ALIASES)

  // Remove undefined entries
  for (const key of Object.keys(mapping) as Array<keyof ColumnMapping>) {
    if (mapping[key] === undefined) {
      delete mapping[key]
    }
  }

  return mapping
}

// ── Recurring Charge Detection ────────────────────────────────────────

interface RawTransaction {
  name: string
  amount: number
  date?: string
  currency?: string
  category?: string
  notes?: string
  rowIndex: number
}

function extractTransactions(
  rows: string[][],
  mapping: ColumnMapping,
  formats: ImportFormats,
  errors: string[]
): RawTransaction[] {
  const transactions: RawTransaction[] = []
  for (let i = 0; i < rows.length; i++) {
    if (mapping.name === undefined || mapping.amount === undefined) continue
    const row = rows[i]
    try {
      const name = row[mapping.name]?.trim() ?? ''
      const notes = mapping.notes !== undefined ? row[mapping.notes] || undefined : undefined
      const category =
        mapping.category !== undefined ? row[mapping.category]?.trim() || undefined : undefined
      validateImportFields(name, notes, category)
      // Bank exports represent charges as either debits or positive amounts.
      const amount = Math.abs(parseImportAmount(row[mapping.amount] ?? '', formats.amountFormat))
      if (amount <= 0) throw new Error(`Invalid amount "${row[mapping.amount]}"; must be nonzero`)
      const date = mapping.date !== undefined ? row[mapping.date]?.trim() : undefined
      transactions.push({
        name,
        amount,
        date: date ? parseImportDate(date, formats.dateFormat) : undefined,
        currency:
          mapping.currency !== undefined ? row[mapping.currency]?.trim().toUpperCase() : undefined,
        category,
        notes,
        rowIndex: i,
      })
    } catch (error) {
      errors.push(`Row ${i + 2}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return transactions
}

function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferBillingCycle(dates: string[]): { cycle: BillingCycle; confidence: number } {
  if (dates.length < 2) {
    return { cycle: 'monthly', confidence: 0.3 }
  }

  const parsedDates = dates
    .map((d) => dayjs(d))
    .filter((d) => d.isValid())
    .sort((a, b) => a.unix() - b.unix())

  if (parsedDates.length < 2) {
    return { cycle: 'monthly', confidence: 0.3 }
  }

  // Calculate average gap in days between consecutive payments
  const gaps: number[] = []
  for (let i = 1; i < parsedDates.length; i++) {
    gaps.push(parsedDates[i].diff(parsedDates[i - 1], 'day'))
  }

  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length

  // Classify based on average gap
  if (avgGap <= 10) {
    return { cycle: 'weekly', confidence: avgGap >= 5 && avgGap <= 9 ? 0.8 : 0.5 }
  }
  if (avgGap <= 45) {
    return { cycle: 'monthly', confidence: avgGap >= 25 && avgGap <= 35 ? 0.9 : 0.6 }
  }
  if (avgGap <= 120) {
    return { cycle: 'quarterly', confidence: avgGap >= 80 && avgGap <= 100 ? 0.85 : 0.5 }
  }
  return { cycle: 'yearly', confidence: avgGap >= 350 && avgGap <= 380 ? 0.85 : 0.4 }
}

export function detectRecurringCharges(
  rows: string[][],
  mapping: ColumnMapping,
  formats: ImportFormats = {},
  errors: string[] = []
): DetectedSubscription[] {
  const transactions = extractTransactions(rows, mapping, formats, errors)

  if (transactions.length === 0) return []

  // Group by normalized merchant name
  const groups = new Map<string, RawTransaction[]>()
  for (const tx of transactions) {
    const key = normalizeMerchantName(tx.name)
    if (!key) continue
    const group = groups.get(key) || []
    group.push(tx)
    groups.set(key, group)
  }

  const detected: DetectedSubscription[] = []

  for (const [, txs] of groups) {
    // Use the most common amount for this merchant
    const amountCounts = new Map<number, number>()
    for (const tx of txs) {
      const rounded = Math.round(tx.amount * 100) / 100
      amountCounts.set(rounded, (amountCounts.get(rounded) || 0) + 1)
    }
    let bestAmount = txs[0].amount
    let bestCount = 0
    for (const [amount, count] of amountCounts) {
      if (count > bestCount) {
        bestAmount = amount
        bestCount = count
      }
    }

    // Infer billing cycle from dates
    const dates = txs
      .map((tx) => tx.date)
      .filter((d): d is string => d !== undefined && d.length > 0)
    const { cycle, confidence } = inferBillingCycle(dates)

    // Use the original (non-normalized) name from the most recent transaction
    const sortedByDate = [...txs].sort((a, b) => {
      if (!a.date || !b.date) return 0
      const da = dayjs(a.date)
      const db = dayjs(b.date)
      if (!da.isValid() || !db.isValid()) return 0
      return db.unix() - da.unix()
    })
    const latestTx = sortedByDate[0]

    // Calculate next payment date from the latest date
    let nextPaymentDate: string | undefined
    if (latestTx.date) {
      const lastDate = dayjs(latestTx.date)
      if (lastDate.isValid()) {
        nextPaymentDate = dayjs(calculateNextPaymentDate(lastDate.toDate(), cycle)).format(
          'YYYY-MM-DD'
        )
      }
    }

    // Determine if this looks like a subscription (recurring same-amount charges)
    const isLikelySubscription =
      txs.length >= 2 || (txs.length === 1 && mapping.billing_cycle !== undefined)

    detected.push({
      name: latestTx.name,
      amount: bestAmount,
      currency: latestTx.currency || 'USD',
      billing_cycle: cycle,
      confidence,
      include: isLikelySubscription,
      category_name: latestTx.category || undefined,
      next_payment_date: nextPaymentDate,
      notes: latestTx.notes || undefined,
      source_rows: txs.map((tx) => tx.rowIndex),
    })
  }

  // Sort: included first, then by confidence descending, then by name
  detected.sort((a, b) => {
    if (a.include !== b.include) return a.include ? -1 : 1
    if (a.confidence !== b.confidence) return b.confidence - a.confidence
    return a.name.localeCompare(b.name)
  })

  return detected
}
