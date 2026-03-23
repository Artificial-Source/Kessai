import { describe, it, expect } from 'vitest'
import { parseCSV, parseSubbyJSON, detectAndParseJSON, getCSVHeaders } from '../import-parsers'

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

  it('skips rows with zero amount', () => {
    const csv = `name,amount
Free,0
Paid,5.00`

    const result = parseCSV(csv)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('Paid')
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

describe('parseSubbyJSON', () => {
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

  it('parses valid Subby backup', () => {
    const result = parseSubbyJSON(validBackup)

    expect(result.source).toBe('subby-json')
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
    const result = parseSubbyJSON({ subscriptions: [] })

    expect(result.subscriptions).toHaveLength(0)
    expect(result.errors[0]).toContain('Not a valid Subby backup format')
  })

  it('returns error for empty object', () => {
    const result = parseSubbyJSON({})

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

    const result = parseSubbyJSON(backup)

    expect(result.subscriptions).toHaveLength(1)
    expect(result.subscriptions[0].name).toBe('Valid')
  })

  it('defaults invalid billing cycles to monthly', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: 'USD', billing_cycle: 'biweekly' }],
    }

    const result = parseSubbyJSON(backup)

    expect(result.subscriptions[0].billing_cycle).toBe('monthly')
  })

  it('defaults currency to USD when missing', () => {
    const backup = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: '', billing_cycle: 'monthly' }],
    }

    const result = parseSubbyJSON(backup)

    expect(result.subscriptions[0].currency).toBe('USD')
  })

  it('resolves category names from category map', () => {
    const result = parseSubbyJSON(validBackup)

    expect(result.subscriptions[0].category_name).toBe('Entertainment')
  })
})

describe('detectAndParseJSON', () => {
  it('detects Subby format', () => {
    const data = {
      version: '1.0',
      exportedAt: '2025-06-01',
      subscriptions: [{ name: 'Test', amount: 10, currency: 'USD', billing_cycle: 'monthly' }],
    }

    const result = detectAndParseJSON(data)

    expect(result.source).toBe('subby-json')
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
