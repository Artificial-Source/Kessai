export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
export const MAX_IMPORT_ROWS = 10_000
export const MAX_IMPORT_NAME_LENGTH = 100
export const MAX_IMPORT_NOTES_LENGTH = 500

export type AmountFormat = 'auto' | 'decimal-dot' | 'decimal-comma'
export type DateFormat = 'auto' | 'day-first' | 'month-first'
export interface ImportFormats {
  amountFormat?: AmountFormat
  dateFormat?: DateFormat
}

export interface CSVRecords {
  headers: string[]
  rows: string[][]
  delimiter: string
}

function detectDelimiter(content: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  let quoted = false
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (char === '"') {
      if (quoted && content[i + 1] === '"') i++
      else quoted = !quoted
    } else if (!quoted) {
      if (char === '\r' || char === '\n') break
      if (char in counts) counts[char]++
    }
  }
  return Object.entries(counts).reduce((best, entry) => (entry[1] > best[1] ? entry : best))[0]
}

/** RFC-4180 records, with semicolon/tab detection and blank physical lines ignored outside fields. */
export function tokenizeCSV(content: string): CSVRecords {
  content = content.replace(/^\uFEFF/, '')
  const delimiter = detectDelimiter(content)
  const records: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let wasQuoted = false
  let closedQuote = false
  const finishField = () => {
    row.push(wasQuoted ? field : field.trim())
    field = ''
    wasQuoted = false
    closedQuote = false
  }
  const finishRow = () => {
    const hasContent = wasQuoted || row.length > 0 || field.trim().length > 0
    finishField()
    if (hasContent) records.push(row)
    row = []
    if (records.length > MAX_IMPORT_ROWS + 1)
      throw new Error(`CSV exceeds ${MAX_IMPORT_ROWS} data rows`)
  }
  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    if (quoted) {
      if (char === '"') {
        if (content[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          closedQuote = true
        }
      } else field += char
    } else if (char === delimiter) {
      finishField()
    } else if (char === '\r' || char === '\n') {
      finishRow()
      if (char === '\r' && content[i + 1] === '\n') i++
    } else if (closedQuote) {
      if (!/\s/.test(char)) throw new Error('Invalid CSV: unexpected text after closing quote')
    } else if (char === '"') {
      if (field.trim()) throw new Error('Invalid CSV: unexpected quote in unquoted field')
      field = ''
      quoted = true
      wasQuoted = true
    } else field += char
  }
  if (quoted) throw new Error('Invalid CSV: unterminated quoted field')
  if (field.length || row.length || wasQuoted) finishRow()
  return { headers: records[0] ?? [], rows: records.slice(1), delimiter }
}

function cleanAmount(raw: string): string {
  return raw.replace(/[\p{Sc}\s]/gu, '')
}

export function detectAmountFormat(
  values: string[],
  delimiter?: string
): Exclude<AmountFormat, 'auto'> | 'mixed' {
  const formats = new Set<Exclude<AmountFormat, 'auto'>>()
  for (const raw of values) {
    const value = cleanAmount(raw)
    if (value.includes(',') && value.includes('.')) {
      formats.add(value.lastIndexOf(',') > value.lastIndexOf('.') ? 'decimal-comma' : 'decimal-dot')
    } else if (value.includes(',')) formats.add('decimal-comma')
    else if (value.includes('.')) formats.add('decimal-dot')
  }
  if (formats.size > 1) return 'mixed'
  return formats.values().next().value ?? (delimiter === ';' ? 'decimal-comma' : 'decimal-dot')
}

export function parseImportAmount(raw: string, format: AmountFormat = 'auto'): number {
  const value = cleanAmount(raw)
  const detected = format === 'auto' ? detectAmountFormat([value]) : format
  const decimalComma = detected === 'decimal-comma'
  const pattern = decimalComma
    ? /^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/
    : /^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/
  if (!pattern.test(value)) throw new Error(`Invalid amount "${raw}"`)
  const normalized = decimalComma
    ? value.replace(/\./g, '').replace(',', '.')
    : value.replace(/,/g, '')
  const amount = Number(normalized)
  if (!Number.isFinite(amount)) throw new Error(`Invalid amount "${raw}"`)
  return amount
}

export function parseImportDate(raw: string, format: DateFormat = 'auto'): string {
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (slash) {
    const first = Number(slash[1])
    const second = Number(slash[2])
    year = Number(slash[3])
    if (format === 'auto' && first <= 12 && second <= 12 && first !== second) {
      throw new Error(`Ambiguous date "${raw}"; choose DD/MM/YYYY or MM/DD/YYYY`)
    }
    const dayFirst = format === 'day-first' || (format === 'auto' && first > 12)
    day = dayFirst ? first : second
    month = dayFirst ? second : first
  } else throw new Error(`Invalid date "${raw}"`)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new Error(`Invalid date "${raw}"`)
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function validateImportFields(name: string, notes?: string, category?: string): void {
  if (!name.trim()) throw new Error('Missing name')
  if (name.length > MAX_IMPORT_NAME_LENGTH)
    throw new Error(`Name exceeds ${MAX_IMPORT_NAME_LENGTH} characters`)
  if (notes && notes.length > MAX_IMPORT_NOTES_LENGTH)
    throw new Error(`Notes exceed ${MAX_IMPORT_NOTES_LENGTH} characters`)
  if (category && category.length > 50) throw new Error('Category name exceeds 50 characters')
}

export function readImportFile(file: File): Promise<string> {
  if (file.size > MAX_IMPORT_FILE_BYTES)
    return Promise.reject(new Error('Import file exceeds 10 MiB limit'))
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () =>
      typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('Failed to read file'))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
