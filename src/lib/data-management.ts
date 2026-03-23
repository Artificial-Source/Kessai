import { apiInvoke as invoke } from '@/lib/api'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Payment } from '@/types/payment'
import type { PriceChange } from '@/types/price-history'
import type { Tag } from '@/types/tag'
import type { Settings } from '@/types/settings'

function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window
}

interface BackupData {
  version: string
  exportedAt: string
  subscriptions: Subscription[]
  categories: Category[]
  payments: Payment[]
  price_history?: PriceChange[]
  tags?: Tag[]
  subscription_tags?: { subscription_id: string; tag_id: string }[]
  settings: Omit<Settings, 'id'>
}

interface ImportResult {
  success: boolean
  message: string
}

export async function exportData(): Promise<BackupData> {
  return await invoke<BackupData>('export_data')
}

export async function saveBackupToFile(data: BackupData): Promise<boolean> {
  if (!isTauri()) {
    // In web mode, trigger a browser download instead
    const json = JSON.stringify(data, null, 2)
    const date = new Date().toISOString().split('T')[0]
    const filename = `subby-backup-${date}.json`
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
    return true
  }

  const { save } = await import('@tauri-apps/plugin-dialog')
  const { writeTextFile } = await import('@tauri-apps/plugin-fs')

  const json = JSON.stringify(data, null, 2)
  const date = new Date().toISOString().split('T')[0]
  const defaultFilename = `subby-backup-${date}.json`

  const filePath = await save({
    defaultPath: defaultFilename,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    title: 'Export Subby Backup',
  })

  if (!filePath) {
    return false
  }

  await writeTextFile(filePath, json)
  return true
}

export function validateBackupData(data: unknown): data is BackupData {
  if (!data || typeof data !== 'object') return false

  const backup = data as Record<string, unknown>

  if (typeof backup.version !== 'string') return false
  if (typeof backup.exportedAt !== 'string') return false
  if (!Array.isArray(backup.subscriptions)) return false
  if (!Array.isArray(backup.categories)) return false
  if (!Array.isArray(backup.payments)) return false
  if (!backup.settings || typeof backup.settings !== 'object') return false

  // Size limits to prevent DoS via memory exhaustion
  if (backup.subscriptions.length > 10000) return false
  if (backup.categories.length > 1000) return false
  if (backup.payments.length > 100000) return false

  return true
}

export async function importData(
  data: BackupData,
  options: {
    clearExisting?: boolean
  } = {}
): Promise<{ success: boolean; message: string }> {
  try {
    const result = await invoke<ImportResult>('import_data', {
      data,
      clearExisting: options.clearExisting ?? false,
    })
    return result
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function readFileAsJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string)
        resolve(json)
      } catch {
        reject(new Error('Invalid JSON file'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
