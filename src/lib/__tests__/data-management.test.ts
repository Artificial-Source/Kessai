import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  validateBackupData,
  readFileAsJson,
  exportData,
  importData,
  saveBackupToFile,
  MAX_BACKUP_FILE_BYTES,
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
      display_exchange_rates: {},
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

  it('rejects a future unsupported backup version', () => {
    expect(validateBackupData({ ...validBackup, version: '1.3.0' })).toBe(false)
  })

  it.each(['not-a-date', '2026-02-30T00:00:00Z', '2026-10-21'])(
    'rejects an invalid exportedAt timestamp %s',
    (exportedAt) => {
      expect(validateBackupData({ ...validBackup, exportedAt })).toBe(false)
    }
  )

  it('tolerates unknown metadata and accepts timestamp offsets', () => {
    expect(
      validateBackupData({
        ...validBackup,
        version: '1.2.0',
        exportedAt: '2026-10-21T09:00:00+09:00',
        futureKey: true,
      })
    ).toBe(true)
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

  it('accepts optional payment cards at the limit', () => {
    const backup = { ...validBackup, payment_cards: new Array(1000) }
    expect(validateBackupData(backup)).toBe(true)
  })

  it('rejects invalid or oversized optional payment cards', () => {
    expect(validateBackupData({ ...validBackup, payment_cards: {} })).toBe(false)
    expect(validateBackupData({ ...validBackup, payment_cards: new Array(1001) })).toBe(false)
  })

  it('accepts names and notes at their schema limits', () => {
    const backup = {
      ...validBackup,
      subscriptions: [
        { id: 'sub-1', name: 'n'.repeat(100), notes: 'x'.repeat(500) },
        { id: 'sub-2', name: 'Fastmail', notes: null },
      ],
      categories: [{ id: 'cat-1', name: 'c'.repeat(50) }],
      tags: [{ id: 'tag-1', name: 't'.repeat(30) }],
    }
    expect(validateBackupData(backup)).toBe(true)
  })

  it('rejects an oversized subscription name without truncating it', () => {
    const name = 'n'.repeat(101)
    const backup = { ...validBackup, subscriptions: [{ id: 'sub-1', name, notes: null }] }

    expect(validateBackupData(backup)).toBe(false)
    expect(backup.subscriptions[0].name).toBe(name)
  })

  it('rejects oversized subscription notes without truncating them', () => {
    const notes = 'x'.repeat(501)
    const backup = { ...validBackup, subscriptions: [{ id: 'sub-1', name: 'Fastmail', notes }] }

    expect(validateBackupData(backup)).toBe(false)
    expect(backup.subscriptions[0].notes).toBe(notes)
  })

  it('rejects an oversized category name', () => {
    const backup = { ...validBackup, categories: [{ id: 'cat-1', name: 'c'.repeat(51) }] }
    expect(validateBackupData(backup)).toBe(false)
  })

  it('rejects an oversized tag name', () => {
    const backup = { ...validBackup, tags: [{ id: 'tag-1', name: 't'.repeat(31) }] }
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
        display_exchange_rates: {},
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
        display_exchange_rates: {},
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
        display_exchange_rates: {},
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
        display_exchange_rates: {},
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
        display_exchange_rates: {},
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
  const backup = {
    version: '1.0.0',
    exportedAt: '2026-01-01T00:00:00.000Z',
    subscriptions: [],
    categories: [],
    payments: [],
    settings: {
      theme: 'dark',
      currency: 'USD',
      display_exchange_rates: {},
      notification_enabled: true,
      notification_days_before: [1, 3, 7],
      notification_advance_days: 1,
      notification_time: '09:00',
      reduce_motion: false,
      enable_transitions: true,
      enable_hover_effects: true,
      animation_speed: 'normal',
    },
  } as Parameters<typeof saveBackupToFile>[0]

  function enableInternalsOnlyDesktopRuntime() {
    Object.defineProperty(window, '__TAURI_INTERNALS__', { configurable: true, value: {} })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T23:45:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    Reflect.deleteProperty(window, '__TAURI__')
    Reflect.deleteProperty(window, '__TAURI_INTERNALS__')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('saves through the desktop dialog when only __TAURI_INTERNALS__ is present', async () => {
    enableInternalsOnlyDesktopRuntime()
    mockSave.mockResolvedValue('/home/user/backup.json')
    mockWriteTextFile.mockResolvedValue(undefined)

    const result = await saveBackupToFile(backup)

    expect('__TAURI__' in window).toBe(false)
    expect(result).toBe(true)
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: 'kessai-backup-2026-10-21.json' })
    )
    expect(mockWriteTextFile).toHaveBeenCalledWith(
      '/home/user/backup.json',
      JSON.stringify(backup, null, 2)
    )
  })

  it('returns false when user cancels save dialog', async () => {
    enableInternalsOnlyDesktopRuntime()
    mockSave.mockResolvedValue(null)

    const result = await saveBackupToFile(backup)

    expect(result).toBe(false)
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })

  it('downloads in a browser runtime without opening the desktop dialog', async () => {
    const createObjectURL = vi.fn(() => 'blob:kessai-backup')
    const revokeObjectURL = vi.fn()
    class StubURL extends URL {
      static createObjectURL = createObjectURL
      static revokeObjectURL = revokeObjectURL
    }
    vi.stubGlobal('URL', StubURL)
    const downloads: string[] = []
    const click = vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download)
    })

    const result = await saveBackupToFile(backup)

    expect(result).toBe(true)
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(click).toHaveBeenCalledOnce()
    expect(downloads).toEqual(['kessai-backup-2026-10-21.json'])
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:kessai-backup')
    expect(mockSave).not.toHaveBeenCalled()
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })
})

describe('readFileAsJson', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

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

  it('rejects a file over the byte limit before reading it', async () => {
    const readAsText = vi.spyOn(FileReader.prototype, 'readAsText')
    const file = new File(['{}'], 'huge.json', { type: 'application/json' })
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_FILE_BYTES + 1 })

    await expect(readFileAsJson(file)).rejects.toThrow(
      'Backup file is too large. The maximum size is 25 MiB.'
    )
    expect(readAsText).not.toHaveBeenCalled()
  })

  it('reads a file exactly at the byte limit', async () => {
    const file = new File([JSON.stringify({ ok: true })], 'limit.json', {
      type: 'application/json',
    })
    Object.defineProperty(file, 'size', { value: MAX_BACKUP_FILE_BYTES })

    await expect(readFileAsJson(file)).resolves.toEqual({ ok: true })
  })
})
