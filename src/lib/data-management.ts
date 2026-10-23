import { apiInvoke as invoke, type BackupData, type ImportResult } from '@/lib/api'
import { isTauriRuntime } from '@/lib/runtime'
import { categorySchema } from '@/types/category'
import { subscriptionSchema } from '@/types/subscription'
import { tagSchema } from '@/types/tag'
import { z } from 'zod'

/** Largest backup file read into memory. Checked before any bytes are read. */
export const MAX_BACKUP_FILE_BYTES = 25 * 1024 * 1024

// Field length limits come from the app's entity schemas so a backup cannot carry
// values the editors would refuse.
const SUBSCRIPTION_NAME_MAX = subscriptionSchema.shape.name.maxLength
const SUBSCRIPTION_NOTES_MAX = subscriptionSchema.shape.notes.unwrap().maxLength
const CATEGORY_NAME_MAX = categorySchema.shape.name.maxLength
const TAG_NAME_MAX = tagSchema.shape.name.maxLength
const backupMetadataSchema = z.object({
  version: z.enum(['1.0.0', '1.1.0', '1.2.0']),
  exportedAt: z.iso.datetime({ offset: true }),
})

export async function exportData(): Promise<BackupData> {
  return await invoke('export_data')
}

export async function saveBackupToFile(data: BackupData): Promise<boolean> {
  if (!isTauriRuntime()) {
    // In web mode, trigger a browser download instead
    const json = JSON.stringify(data, null, 2)
    const date = new Date().toISOString().split('T')[0]
    const filename = `kessai-backup-${date}.json`
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
  const defaultFilename = `kessai-backup-${date}.json`

  const filePath = await save({
    defaultPath: defaultFilename,
    filters: [{ name: 'JSON', extensions: ['json'] }],
    title: 'Export Kessai Backup',
  })

  if (!filePath) {
    return false
  }

  await writeTextFile(filePath, json)
  return true
}

function hasOversizedString(records: unknown[], field: string, max: number | null): boolean {
  if (max === null) return false
  return records.some((record) => {
    if (!record || typeof record !== 'object') return false
    const value = (record as Record<string, unknown>)[field]
    return typeof value === 'string' && value.length > max
  })
}

/**
 * Pre-flight check before a backup is sent to core: supported version, RFC 3339
 * export timestamp, top-level shape, collection counts, and entity name/notes
 * length limits. Records are not validated field by field; core remains the
 * authority on whether a backup can be restored.
 */
export function validateBackupData(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false

  const backup = data as Record<string, unknown>

  if (!backupMetadataSchema.safeParse(backup).success) return false
  if (!Array.isArray(backup.subscriptions)) return false
  if (!Array.isArray(backup.categories)) return false
  if (!Array.isArray(backup.payments)) return false
  if (!backup.settings || typeof backup.settings !== 'object') return false

  // Collection count limits mirror core. They bound record counts, not memory use;
  // the byte cap in readFileAsJson applies before parsing.
  if (backup.subscriptions.length > 10000) return false
  if (backup.categories.length > 1000) return false
  if (backup.payments.length > 100000) return false
  if (backup.payment_cards !== undefined) {
    if (!Array.isArray(backup.payment_cards)) return false
    if (backup.payment_cards.length > 1000) return false
  }

  if (hasOversizedString(backup.subscriptions, 'name', SUBSCRIPTION_NAME_MAX)) return false
  if (hasOversizedString(backup.subscriptions, 'notes', SUBSCRIPTION_NOTES_MAX)) return false
  if (hasOversizedString(backup.categories, 'name', CATEGORY_NAME_MAX)) return false
  if (Array.isArray(backup.tags) && hasOversizedString(backup.tags, 'name', TAG_NAME_MAX)) {
    return false
  }

  return true
}

export async function importData(
  data: unknown,
  options: {
    clearExisting?: boolean
  } = {}
): Promise<ImportResult> {
  try {
    return await invoke('import_data', {
      data,
      clearExisting: options.clearExisting ?? false,
    })
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export function readFileAsJson(file: File): Promise<unknown> {
  if (file.size > MAX_BACKUP_FILE_BYTES) {
    const maxMiB = MAX_BACKUP_FILE_BYTES / (1024 * 1024)
    return Promise.reject(new Error(`Backup file is too large. The maximum size is ${maxMiB} MiB.`))
  }

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
