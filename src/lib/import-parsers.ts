import dayjs from 'dayjs'
import type { BillingCycle } from '@/types/subscription'

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
  source: 'csv' | 'subby-json' | 'wallos-json' | 'unknown'
}

// ── CSV Parsing ────────────────────────────────────────────────────────

/** Standard column names we look for (case-insensitive) */
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
  if (['monthly', 'month', 'm', '1 month', '1m'].includes(lower)) return 'monthly'
  if (['quarterly', 'quarter', 'q', '3 months', '3m'].includes(lower)) return 'quarterly'
  if (['yearly', 'year', 'annual', 'annually', 'y', '12 months', '12m', '1 year'].includes(lower))
    return 'yearly'
  return 'monthly' // default
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

function findColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {}
  const normalizedHeaders = headers.map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_]/g, '_')
  )

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    for (const alias of aliases) {
      const index = normalizedHeaders.indexOf(alias)
      if (index !== -1) {
        mapping[field] = index
        break
      }
    }
  }

  return mapping
}

export function parseCSV(content: string, customMapping?: Record<string, number>): ParseResult {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)

  if (lines.length < 2) {
    return {
      subscriptions: [],
      errors: ['CSV file must have a header row and at least one data row'],
      source: 'csv',
    }
  }

  const headers = parseCSVLine(lines[0])
  const mapping = customMapping ?? findColumnMapping(headers)

  if (mapping.name === undefined || mapping.amount === undefined) {
    return {
      subscriptions: [],
      errors: [
        `Could not find required columns. Found headers: ${headers.join(', ')}. Need at least "name" and "amount" columns.`,
      ],
      source: 'csv',
    }
  }

  const subscriptions: ParsedSubscription[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i])
    const rowNum = i + 1

    const name = fields[mapping.name]?.trim()
    if (!name) {
      errors.push(`Row ${rowNum}: Missing name`)
      continue
    }

    const amountStr = fields[mapping.amount]?.trim().replace(/[^0-9.-]/g, '')
    const amount = parseFloat(amountStr)
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Row ${rowNum}: Invalid amount "${fields[mapping.amount]}"`)
      continue
    }

    const currency =
      mapping.currency !== undefined
        ? fields[mapping.currency]?.trim().toUpperCase() || 'USD'
        : 'USD'
    const billingCycleRaw =
      mapping.billing_cycle !== undefined
        ? fields[mapping.billing_cycle]?.trim() || 'monthly'
        : 'monthly'
    const category = mapping.category !== undefined ? fields[mapping.category]?.trim() : undefined
    const startDateRaw =
      mapping.start_date !== undefined ? fields[mapping.start_date]?.trim() : undefined
    const notes = mapping.notes !== undefined ? fields[mapping.notes]?.trim() : undefined

    let startDate: string | undefined
    if (startDateRaw) {
      const parsed = dayjs(startDateRaw)
      if (parsed.isValid()) {
        startDate = parsed.format('YYYY-MM-DD')
      }
    }

    subscriptions.push({
      name,
      amount,
      currency,
      billing_cycle: normalizeBillingCycle(billingCycleRaw),
      category_name: category || undefined,
      start_date: startDate,
      notes: notes || undefined,
    })
  }

  return { subscriptions, errors, source: 'csv' }
}

export function getCSVHeaders(content: string): string[] {
  const firstLine = content.split(/\r?\n/)[0]
  if (!firstLine) return []
  return parseCSVLine(firstLine)
}

// ── Wallos JSON Parsing ────────────────────────────────────────────────

interface WallosSubscription {
  name?: string
  price?: number | string
  currency_code?: string
  cycle?: number | string
  frequency?: number | string
  category_name?: string
  next_payment?: string
  notes?: string
  payer_user_id?: number
  url?: string
}

interface WallosExport {
  subscriptions?: WallosSubscription[]
}

function wallosCycleToBillingCycle(
  cycle: number | string,
  frequency?: number | string
): BillingCycle {
  const c = Number(cycle)
  const f = Number(frequency) || 1
  // Wallos uses: 1=daily, 2=weekly, 3=monthly, 4=yearly
  // with frequency multiplier
  if (c === 2) return 'weekly'
  if (c === 3 && f === 3) return 'quarterly'
  if (c === 4 || (c === 3 && f === 12)) return 'yearly'
  return 'monthly'
}

export function parseWallosJSON(data: unknown): ParseResult {
  const errors: string[] = []

  const wallosData = data as WallosExport
  if (!wallosData.subscriptions || !Array.isArray(wallosData.subscriptions)) {
    return {
      subscriptions: [],
      errors: ['Not a valid Wallos export format'],
      source: 'wallos-json',
    }
  }

  const subscriptions: ParsedSubscription[] = []

  for (const sub of wallosData.subscriptions) {
    if (!sub.name) {
      errors.push(`Skipped entry without name`)
      continue
    }

    const amount = typeof sub.price === 'string' ? parseFloat(sub.price) : (sub.price ?? 0)
    if (isNaN(amount) || amount <= 0) {
      errors.push(`Skipped "${sub.name}": invalid price`)
      continue
    }

    let startDate: string | undefined
    if (sub.next_payment) {
      const parsed = dayjs(sub.next_payment)
      if (parsed.isValid()) {
        startDate = parsed.format('YYYY-MM-DD')
      }
    }

    subscriptions.push({
      name: sub.name,
      amount,
      currency: sub.currency_code?.toUpperCase() || 'USD',
      billing_cycle: wallosCycleToBillingCycle(sub.cycle ?? 3, sub.frequency),
      category_name: sub.category_name || undefined,
      start_date: startDate,
      notes: sub.notes || undefined,
    })
  }

  return { subscriptions, errors, source: 'wallos-json' }
}

// ── Subby JSON Parsing ─────────────────────────────────────────────────

interface SubbyBackup {
  version?: string
  exportedAt?: string
  subscriptions?: Array<{
    name: string
    amount: number
    currency: string
    billing_cycle: string
    category_id?: string | null
    next_payment_date?: string | null
    notes?: string | null
  }>
  categories?: Array<{
    id: string
    name: string
  }>
}

export function parseSubbyJSON(data: unknown): ParseResult {
  const backup = data as SubbyBackup

  if (!backup.version || !backup.subscriptions || !Array.isArray(backup.subscriptions)) {
    return { subscriptions: [], errors: ['Not a valid Subby backup format'], source: 'subby-json' }
  }

  const categoryMap = new Map<string, string>()
  if (backup.categories) {
    for (const cat of backup.categories) {
      categoryMap.set(cat.id, cat.name)
    }
  }

  const subscriptions: ParsedSubscription[] = []
  const errors: string[] = []

  for (const sub of backup.subscriptions) {
    if (!sub.name || !sub.amount) {
      errors.push(`Skipped entry without name or amount`)
      continue
    }

    const billingCycle = (
      ['weekly', 'monthly', 'quarterly', 'yearly', 'custom'] as BillingCycle[]
    ).includes(sub.billing_cycle as BillingCycle)
      ? (sub.billing_cycle as BillingCycle)
      : 'monthly'

    subscriptions.push({
      name: sub.name,
      amount: sub.amount,
      currency: sub.currency || 'USD',
      billing_cycle: billingCycle,
      category_name: sub.category_id ? categoryMap.get(sub.category_id) : undefined,
      start_date: sub.next_payment_date || undefined,
      notes: sub.notes || undefined,
    })
  }

  return { subscriptions, errors, source: 'subby-json' }
}

// ── Auto-detect format ─────────────────────────────────────────────────

export function detectAndParseJSON(data: unknown): ParseResult {
  const obj = data as Record<string, unknown>

  // Check for Subby format first (has version and exportedAt)
  if (obj.version && obj.exportedAt && obj.subscriptions) {
    return parseSubbyJSON(data)
  }

  // Check for Wallos format (has subscriptions array with price/cycle fields)
  if (obj.subscriptions && Array.isArray(obj.subscriptions)) {
    const first = (obj.subscriptions as Record<string, unknown>[])[0]
    if (first && ('price' in first || 'cycle' in first || 'payer_user_id' in first)) {
      return parseWallosJSON(data)
    }
  }

  return {
    subscriptions: [],
    errors: ['Unknown JSON format. Supported: Subby backup, Wallos export.'],
    source: 'unknown',
  }
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve(e.target?.result as string)
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
