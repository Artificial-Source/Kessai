import { describe, it, expect } from 'vitest'
import {
  parseCSV,
  parseKessaiJSON,
  parseWallosJSON,
  detectAndParseJSON,
  getCSVHeaders,
} from '../import-parsers'

describe('parseCSV', () => {
  it('parses valid CSV with standard headers', () => {
    const csv = `name,amount,currency,billing_cycle,category
Netflix,15.99,USD,monthly,Entertainment
Spotify,9.99,EUR,monthly,Music`

    const result = parseCSV(csv)

    expect(result.source).toBe('csv')
    expect(result.subscriptions).toHaveLength(2)
    expect(result.errors).toHaveLength(0)
    expect(result.subscriptions[0]).toEqual({
      name: 'Netflix',
      amount: 15.99,
      currency: 'USD',
      billing_cycle: 'monthly',
      category_name: 'Entertainment',
      start_date: undefined,
      notes: undefined,
    })
  })

  it('handles alternative column names', () => {
    const csv = `service,price,frequency
GitHub,4,yearly`

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('GitHub')
    expect(result.subscriptions[0].amount).toBe(4)
    expect(result.subscriptions[0].billing_cycle).toBe('yearly')
  })

  it('returns error for CSV with only a header row', () => {
    const csv = 'name,amount'

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors).toContain('CSV file must have a header row and at least one data row')
  })

  it('returns error for empty content', () => {
    const result = parseCSV('')

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('returns error when required columns are missing', () => {
    const csv = `foo,bar
a,b`

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors[0]).toContain('Could not find required columns')
  })

  it('skips rows with missing name', () => {
    const csv = `name,amount
,10.00
Valid,5.00`

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('Valid')
    expect(result.errors).toContain('Row 2: Missing name')
  })

  it('skips rows with invalid amount', () => {
    const csv = `name,amount
Netflix,abc
Spotify,9.99`

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('Spotify')
    expect(result.errors[0]).toContain('Row 2: Invalid amount')
  })

  it('imports zero-amount rows (free tiers) and rejects negative amounts', () => {
    const csv = `name,amount
Free,0
Refund,-5
Paid,5.00`

    const result = parseCSV(csv)

    expect(result.subscriptions.map((s) => [s.name, s.amount])).toEqual([
      ['Free', 0],
      ['Paid', 5],
    ])
    expect(result.errors).toEqual([expect.stringMatching(/^Row 3: Invalid amount "-5"/)])
  })

  it('defaults currency to USD when not provided', () => {
    const csv = `name,amount
Netflix,15.99`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].currency).toBe('USD')
  })

  it('defaults billing cycle to monthly when not provided', () => {
    const csv = `name,amount
Netflix,15.99`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].billing_cycle).toBe('monthly')
  })

  it('normalizes billing cycle aliases', () => {
    const csv = `name,amount,billing_cycle
A,1,weekly
B,2,w
C,3,quarterly
D,4,annual
E,5,y
F,6,unknown`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].billing_cycle).toBe('weekly')
    expect(result.subscriptions[1].billing_cycle).toBe('weekly')
    expect(result.subscriptions[2].billing_cycle).toBe('quarterly')
    expect(result.subscriptions[3].billing_cycle).toBe('yearly')
    expect(result.subscriptions[4].billing_cycle).toBe('yearly')
    expect(result.subscriptions[5].billing_cycle).toBe('monthly') // unknown defaults to monthly
  })

  it('handles quoted fields with commas', () => {
    const csv = `name,amount
"Netflix, Inc.",15.99`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].name).toBe('Netflix, Inc.')
  })

  it('handles Windows-style line endings', () => {
    const csv = 'name,amount\r\nNetflix,15.99\r\nSpotify,9.99'

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(2)
  })

  it('parses valid start dates', () => {
    const csv = `name,amount,start_date
Netflix,15.99,2025-01-15`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].start_date).toBe('2025-01-15')
  })

  it('strips currency symbols from amount', () => {
    const csv = `name,amount
Netflix,$15.99`

    const result = parseCSV(csv)

    expect(result.subscriptions[0].amount).toBe(15.99)
  })
})

describe('getCSVHeaders', () => {
  it('returns headers from first line', () => {
    const csv = `name,amount,currency\nNetflix,15.99,USD`

    const headers = getCSVHeaders(csv)

    expect(headers).toEqual(['name', 'amount', 'currency'])
  })

  it('returns empty array for empty content', () => {
    expect(getCSVHeaders('')).toEqual([])
  })
})

describe('parseKessaiJSON', () => {
  const validBackup = {
    version: '1.0',
    exportedAt: '2025-06-01T00:00:00Z',
    subscriptions: [
      {
        name: 'Netflix',
        amount: 15.99,
        currency: 'USD',
        billing_cycle: 'monthly',
        category_id: 'cat-1',
        notes: 'Shared account',
      },
    ],
    categories: [{ id: 'cat-1', name: 'Entertainment' }],
  }

  it('parses valid Kessai backup', () => {
    const result = parseKessaiJSON(validBackup)

    expect(result.source).toBe('kessai-json')
    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0]).toEqual({
      name: 'Netflix',
      amount: 15.99,
      currency: 'USD',
      billing_cycle: 'monthly',
      category_name: 'Entertainment',
      start_date: undefined,
      notes: 'Shared account',
    })
  })

  it('returns error for invalid format (missing version)', () => {
    const result = parseKessaiJSON({ subscriptions: [] })

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors[0]).toContain('Not a valid Kessai backup format')
  })

  it('returns error for empty object', () => {
    const result = parseKessaiJSON({})

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('skips entries without name or amount', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [
        { name: '', amount: 10, currency: 'USD', billing_cycle: 'monthly' },
        { name: 'Valid', amount: 5, currency: 'USD', billing_cycle: 'monthly' },
      ],
    }

    const result = parseKessaiJSON(backup)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('Valid')
  })

  it('rejects invalid billing cycles with a row error', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: 'USD', billing_cycle: 'biweekly' }],
    }

    const result = parseKessaiJSON(backup)

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors[0]).toMatch(/Row 1:.*billing_cycle/)
  })

  it('defaults currency to USD when missing', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: '', billing_cycle: 'monthly' }],
    }

    const result = parseKessaiJSON(backup)

    expect(result.subscriptions[0].currency).toBe('USD')
  })

  it('resolves category names from category map', () => {
    const result = parseKessaiJSON(validBackup)

    expect(result.subscriptions[0].category_name).toBe('Entertainment')
  })
})

describe('structured import validation', () => {
  it.each([
    null,
    1,
    'text',
    { name: {} },
    { name: 'Service', amount: '12oops' },
    {
      name: 'Service',
      amount: 10,
      billing_cycle: 'monthly',
      next_payment_date: '2026-02-30',
    },
  ])('returns a row error for invalid Kessai records: %j', (record) => {
    const result = parseKessaiJSON({ version: '1.2.0', subscriptions: [record] })
    expect(result.subscriptions).toEqual([])
    expect(result.errors[0]).toMatch(/^Row 1:/)
  })

  it('accepts finite numeric strings and rejects malformed Wallos records independently', () => {
    const result = parseWallosJSON({
      subscriptions: [
        null,
        { name: {} },
        { name: 'Service', price: '9,99', cycle: 3, next_payment: '2026-10-21' },
      ],
    })
    expect(result.errors).toHaveLength(2)
    expect(result.subscriptions).toEqual([
      expect.objectContaining({ name: 'Service', amount: 9.99 }),
    ])
    expect(result.sourceRows).toEqual([3])
  })

  it('does not throw on malformed category collections or primitive envelopes', () => {
    expect(
      parseKessaiJSON({ version: '1.2.0', subscriptions: [], categories: {} }).errors
    ).not.toEqual([])
    expect(detectAndParseJSON(null).source).toBe('unknown')
    expect(detectAndParseJSON({ subscriptions: [null, 3] }).source).toBe('unknown')
  })

  it('rejects oversized name and notes fields without truncating them', () => {
    expect(parseCSV(`name,amount\n${'n'.repeat(101)},10`).errors[0]).toMatch(/Name exceeds/)
    const result = parseKessaiJSON({
      version: '1.2.0',
      subscriptions: [
        { name: 'Service', amount: 10, billing_cycle: 'monthly', notes: 'n'.repeat(501) },
      ],
    })
    expect(result.errors[0]).toMatch(/notes/)
    expect(result.subscriptions).toEqual([])
  })
})

describe('detectAndParseJSON', () => {
  it('detects Kessai format', () => {
    const data = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: 'USD', billing_cycle: 'monthly' }],
    }

    const result = detectAndParseJSON(data)

    expect(result.source).toBe('kessai-json')
  })

  it('detects Wallos format', () => {
    const data = {
      subscriptions: [{ name: 'Test', price: 10, cycle: 3 }],
    }

    const result = detectAndParseJSON(data)

    expect(result.source).toBe('wallos-json')
  })

  it('returns unknown for unrecognized format', () => {
    const data = { foo: 'bar' }

    const result = detectAndParseJSON(data)

    expect(result.source).toBe('unknown')
    expect(result.errors[0]).toContain('Unknown JSON format')
  })

  it('returns unknown for subscriptions array without Wallos fields', () => {
    const data = {
      subscriptions: [{ name: 'Test', amount: 10 }],
    }

    const result = detectAndParseJSON(data)

    expect(result.source).toBe('unknown')
  })
})
