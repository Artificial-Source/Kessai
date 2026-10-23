import { describe, expect, it, vi } from 'vitest'
import {
  tokenizeCSV,
  parseImportAmount,
  parseImportDate,
  readImportFile,
  MAX_IMPORT_FILE_BYTES,
} from '../csv-parser'
import { parseCSVContent, detectRecurringCharges } from '../csv-import'
import { parseCSV } from '../import-parsers'

describe('shared CSV parsing', () => {
  it('preserves multiline quoted fields, blank lines, escaped quotes and CRLF', () => {
    const content =
      'name;amount;notes\r\nService;9,99;"first\r\n\r\nFake;999,""quoted"""\r\nOther;2;plain\r\n'
    const expectedNotes = 'first\r\n\r\nFake;999,"quoted"'
    const records = tokenizeCSV(content)
    expect(records.delimiter).toBe(';')
    expect(records.rows).toHaveLength(2)
    expect(records.rows[0][2]).toBe(expectedNotes)
    expect(parseCSVContent(content).rows).toEqual(records.rows)
    const direct = parseCSV(content)
    expect(direct.subscriptions).toHaveLength(2)
    expect(direct.subscriptions[0]).toMatchObject({ amount: 9.99, notes: expectedNotes })
  })

  it('rejects unterminated quotes rather than creating fake rows', () => {
    const content = 'name,amount,notes\nService,10,"unfinished\nFake,999,notes'
    expect(() => tokenizeCSV(content)).toThrow(/unterminated/i)
    expect(parseCSV(content).errors[0]).toMatch(/unterminated/i)
  })

  it('detects tab delimiters and preserves delimiters inside quotes', () => {
    expect(tokenizeCSV('name\tamount\n"Service; Inc."\t10').rows).toEqual([['Service; Inc.', '10']])
  })

  it.each(['\r\n', '\r', '\n'])('handles BOM, trailing delimiters and %j records', (newline) => {
    expect(tokenizeCSV(`\uFEFFname,amount,notes${newline}Service,10,${newline}`)).toEqual({
      headers: ['name', 'amount', 'notes'],
      rows: [['Service', '10', '']],
      delimiter: ',',
    })
  })

  it.each(['', '\uFEFF', 'name,amount', 'name,amount\r\n'])(
    'returns no data rows for %j',
    (input) => {
      expect(tokenizeCSV(input).rows).toEqual([])
    }
  )

  it('rejects an unterminated quote even when its final character is a newline', () => {
    expect(() => tokenizeCSV('name,amount\n"Service,10\n')).toThrow(/unterminated/i)
  })

  it('parses ten thousand complete subscription rows in under a second', () => {
    const csv = `name,amount,currency\n${Array.from({ length: 10_000 }, (_, i) => `Service ${i},10,USD`).join('\n')}`
    const started = performance.now()
    const parsed = parseCSV(csv)
    const elapsed = performance.now() - started
    expect(parsed.errors).toEqual([])
    expect(parsed.subscriptions).toHaveLength(10_000)
    expect(parsed.subscriptions[9_999].name).toBe('Service 9999')
    expect(elapsed).toBeLessThan(1_000)
  })
})

describe('explicit import formats', () => {
  it.each([
    ['9,99', 9.99],
    ['€ 1.234,56', 1234.56],
    ['€1.234,56', 1234.56],
    ['$1,234.56', 1234.56],
    ['1 234,56', 1234.56],
  ])('parses %s completely', (raw, expected) => {
    expect(parseImportAmount(raw)).toBe(expected)
    expect(parseCSV(`name;amount\nService;${raw}`).subscriptions[0].amount).toBe(expected)
    expect(detectRecurringCharges([['Service', raw]], { name: 0, amount: 1 })[0].amount).toBe(
      expected
    )
  })

  it.each(['12oops', '12.3.4', '1,23.45', 'Infinity', '1e9999', '', '(12.34)', '-'])(
    'rejects malformed amount %s',
    (raw) => {
      expect(() => parseImportAmount(raw)).toThrow(/amount/i)
      expect(parseCSV(`name;amount\nService;${raw}`).errors[0]).toMatch(/Row 2: Invalid amount/)
    }
  )

  it('uses an explicit decimal format override', () => {
    expect(parseImportAmount('1,234', 'decimal-dot')).toBe(1234)
    expect(parseImportAmount('1,234', 'decimal-comma')).toBe(1.234)
  })

  it('rejects ambiguous dates until a date format is chosen', () => {
    expect(() => parseImportDate('03/04/2026')).toThrow(/ambiguous/i)
    expect(parseImportDate('03/04/2026', 'day-first')).toBe('2026-04-03')
    expect(parseImportDate('03/04/2026', 'month-first')).toBe('2026-03-04')
    expect(parseImportDate('25/04/2026')).toBe('2026-04-25')
    expect(parseImportDate('04/25/2026')).toBe('2026-04-25')
    expect(() => parseImportDate('2026-02-30')).toThrow(/date/i)
    expect(parseImportDate('31/12/2026')).toBe('2026-12-31')
    expect(parseImportDate('12/13/2026')).toBe('2026-12-13')
    expect(() => parseImportDate('01/02/2026')).toThrow(/ambiguous/i)
    expect(parseCSV('name,amount,start_date\nService,10,03/04/2026').errors[0]).toMatch(
      /ambiguous/i
    )
  })

  it('reports invalid bank transactions with their original record number', () => {
    const errors: string[] = []
    const detected = detectRecurringCharges(
      [
        ['Bad amount', '12oops', '2026-10-21'],
        ['Ambiguous date', '10', '03/04/2026'],
        ['Valid', '9,99', '2026-10-21'],
      ],
      { name: 0, amount: 1, date: 2 },
      {},
      errors
    )
    expect(detected).toHaveLength(1)
    expect(detected[0].source_rows).toEqual([2])
    expect(errors).toEqual([
      expect.stringMatching(/^Row 2: Invalid amount/),
      expect.stringMatching(/^Row 3: Ambiguous date/),
    ])
  })
})

it('rejects an oversized import before reading it', async () => {
  const file = new File(['small'], 'import.csv')
  Object.defineProperty(file, 'size', { value: MAX_IMPORT_FILE_BYTES + 1 })
  const read = vi.spyOn(FileReader.prototype, 'readAsText')
  await expect(readImportFile(file)).rejects.toThrow(/10 MiB/)
  expect(read).not.toHaveBeenCalled()
  read.mockRestore()
})

it('keeps the bank import recurrence anchored after February', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2025, 2, 1, 12))
  try {
    const detected = detectRecurringCharges(
      [
        ['Service', '10', '2024-12-31'],
        ['Service', '10', '2025-01-31'],
      ],
      { name: 0, amount: 1, date: 2 }
    )
    expect(detected[0].next_payment_date).toBe('2025-03-31')
  } finally {
    vi.useRealTimers()
  }
})
