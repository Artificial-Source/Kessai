import { describe, it, expect, vi, beforeEach } from 'vitest'

// Simulate Tauri environment for saveBackupToFile tests
// @ts-expect-error -- setting Tauri flag for tests
window.__TAURI__ = true

import {
  validateBackupData,
  readFileAsJson,
  exportData,
  importData,
  saveBackupToFile,
} from '../data-management'

const mockInvoke = vi.fn()

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

// Mock Tauri plugins (lazy-imported in saveBackupToFile)
const mockSave = vi.fn()
const mockWriteTextFile = vi.fn()

vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: (...args: unknown[]) => mockSave(...args),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: (...args: unknown[]) => mockWriteTextFile(...args),
}))

describe('validateBackupData', () => {
  const validBackup = {
    version: '1.0.0',
    exportedAt: '2024-01-01T00:00:00.000Z',
    subscriptions: [],
    categories: [],
    payments: [],
    settings: {
      theme: 'dark',
      currency: 'USD',
      notification_enabled: true,
      notification_days_before: [1, 3, 7],
      notification_advance_days: 1,
      notification_time: '09:00',
      reduce_motion: false,
      enable_transitions: true,
      enable_hover_effects: true,
      animation_speed: 'normal',
    },
  }

  it('accepts valid backup data', () => {
    expect(validateBackupData(validBackup)).toBe(true)
  })

  it('accepts backup with populated arrays', () => {
    const backup = {
      ...validBackup,
      subscriptions: [{ id: 'sub-1', name: 'Netflix' }],
      categories: [{ id: 'cat-1', name: 'Streaming' }],
      payments: [{ id: 'pay-1', amount: 15.99 }],
    }
    expect(validateBackupData(backup)).toBe(true)
  })

  it('rejects null', () => {
    expect(validateBackupData(null)).toBe(false)
  })

  it('rejects undefined', () => {
    expect(validateBackupData(undefined)).toBe(false)
  })

  it('rejects non-object values', () => {
    expect(validateBackupData('string')).toBe(false)
    expect(validateBackupData(42)).toBe(false)
    expect(validateBackupData(true)).toBe(false)
  })

  it('rejects missing version', () => {
    const { version: _, ...noVersion } = validBackup
    expect(validateBackupData(noVersion)).toBe(false)
  })

  it('rejects non-string version', () => {
    expect(validateBackupData({ ...validBackup, version: 123 })).toBe(false)
  })

  it('rejects missing exportedAt', () => {
    const { exportedAt: _, ...noExportedAt } = validBackup
    expect(validateBackupData(noExportedAt)).toBe(false)
  })

  it('rejects non-string exportedAt', () => {
    expect(validateBackupData({ ...validBackup, exportedAt: null })).toBe(false)
  })

  it('rejects missing subscriptions', () => {
    const { subscriptions: _, ...noSubs } = validBackup
    expect(validateBackupData(noSubs)).toBe(false)
  })

  it('rejects non-array subscriptions', () => {
    expect(validateBackupData({ ...validBackup, subscriptions: 'not-array' })).toBe(false)
  })

  it('rejects missing categories', () => {
    const { categories: _, ...noCats } = validBackup
    expect(validateBackupData(noCats)).toBe(false)
  })

  it('rejects missing payments', () => {
    const { payments: _, ...noPays } = validBackup
    expect(validateBackupData(noPays)).toBe(false)
  })

  it('rejects missing settings', () => {
    const { settings: _, ...noSettings } = validBackup
    expect(validateBackupData(noSettings)).toBe(false)
  })

  it('rejects null settings', () => {
    expect(validateBackupData({ ...validBackup, settings: null })).toBe(false)
  })

  it('rejects non-object settings', () => {
    expect(validateBackupData({ ...validBackup, settings: 'string' })).toBe(false)
  })

  it('rejects oversized subscriptions array (DoS limit)', () => {
    const backup = { ...validBackup, subscriptions: new Array(10001) }
    expect(validateBackupData(backup)).toBe(false)
  })

  it('accepts subscriptions at the limit', () => {
    const backup = { ...validBackup, subscriptions: new Array(10000) }
    expect(validateBackupData(backup)).toBe(true)
  })

  it('rejects oversized categories array (DoS limit)', () => {
    const backup = { ...validBackup, categories: new Array(1001) }
    expect(validateBackupData(backup)).toBe(false)
  })

  it('rejects oversized payments array (DoS limit)', () => {
    const backup = { ...validBackup, payments: new Array(100001) }
    expect(validateBackupData(backup)).toBe(false)
  })
})

describe('exportData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls invoke with export_data command', async () => {
    const mockBackup = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }
    mockInvoke.mockResolvedValue(mockBackup)

    const result = await exportData()

    expect(mockInvoke).toHaveBeenCalledWith('export_data')
    expect(result).toEqual(mockBackup)
  })
})

describe('importData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls invoke with import_data command and data', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }
    mockInvoke.mockResolvedValue({ success: true, message: 'Imported successfully' })

    const result = await importData(data as Parameters<typeof importData>[0])

    expect(mockInvoke).toHaveBeenCalledWith('import_data', {
      data,
      clearExisting: false,
    })
    expect(result).toEqual({ success: true, message: 'Imported successfully' })
  })

  it('passes clearExisting option when specified', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }
    mockInvoke.mockResolvedValue({ success: true, message: 'OK' })

    await importData(data as Parameters<typeof importData>[0], { clearExisting: true })

    expect(mockInvoke).toHaveBeenCalledWith('import_data', {
      data,
      clearExisting: true,
    })
  })

  it('returns error result when invoke throws', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }
    mockInvoke.mockRejectedValue(new Error('DB error'))

    const result = await importData(data as Parameters<typeof importData>[0])

    expect(result.success).toBe(false)
    expect(result.message).toContain('DB error')
  })

  it('handles non-Error thrown values', async () => {
    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }
    mockInvoke.mockRejectedValue('string error')

    const result = await importData(data as Parameters<typeof importData>[0])

    expect(result.success).toBe(false)
    expect(result.message).toContain('string error')
  })
})

describe('saveBackupToFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when user cancels save dialog', async () => {
    mockSave.mockResolvedValue(null)

    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }

    const result = await saveBackupToFile(data as Parameters<typeof saveBackupToFile>[0])

    expect(result).toBe(false)
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })

  it('writes JSON to selected file path', async () => {
    mockSave.mockResolvedValue('/home/user/backup.json')
    mockWriteTextFile.mockResolvedValue(undefined)

    const data = {
      version: '1.0.0',
      exportedAt: '2026-01-01T00:00:00.000Z',
      subscriptions: [],
      categories: [],
      payments: [],
      settings: {
        theme: 'dark',
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
        notification_advance_days: 1,
        notification_time: '09:00',
        reduce_motion: false,
        enable_transitions: true,
        enable_hover_effects: true,
        animation_speed: 'normal',
      },
    }

    const result = await saveBackupToFile(data as Parameters<typeof saveBackupToFile>[0])

    expect(result).toBe(true)
    expect(mockWriteTextFile).toHaveBeenCalledWith('/home/user/backup.json', expect.any(String))
  })
})

describe('readFileAsJson', () => {
  it('parses valid JSON file', async () => {
    const content = JSON.stringify({ hello: 'world' })
    const file = new File([content], 'test.json', { type: 'application/json' })

    const result = await readFileAsJson(file)
    expect(result).toEqual({ hello: 'world' })
  })

  it('rejects invalid JSON file', async () => {
    const file = new File(['not valid json{{{'], 'bad.json', { type: 'application/json' })

    await expect(readFileAsJson(file)).rejects.toThrow('Invalid JSON file')
  })

  it('parses JSON arrays', async () => {
    const content = JSON.stringify([1, 2, 3])
    const file = new File([content], 'array.json', { type: 'application/json' })

    const result = await readFileAsJson(file)
    expect(result).toEqual([1, 2, 3])
  })
})
