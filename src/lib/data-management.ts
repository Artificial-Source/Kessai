import { getDatabase } from '@/lib/database'
import type { Subscription } from '@/types/subscription'
import type { Category } from '@/types/category'
import type { Payment } from '@/types/payment'
import type { Settings } from '@/types/settings'

interface BackupData {
  version: string
  exportedAt: string
  subscriptions: Subscription[]
  categories: Category[]
  payments: Payment[]
  settings: Omit<Settings, 'id'>
}

export async function exportData(): Promise<BackupData> {
  const db = await getDatabase()

  const subscriptions = await db.select<Subscription[]>('SELECT * FROM subscriptions ORDER BY name')

  const categories = await db.select<Category[]>('SELECT * FROM categories ORDER BY name')

  const payments = await db.select<Payment[]>('SELECT * FROM payments ORDER BY paid_at DESC')

  const settingsRows = await db.select<
    Array<{
      theme: string
      currency: string
      notification_enabled: number
      notification_days_before: string
    }>
  >(
    'SELECT theme, currency, notification_enabled, notification_days_before FROM settings WHERE id = ?',
    ['singleton']
  )

  const settingsRow = settingsRows[0]
  const settings = settingsRow
    ? {
        theme: settingsRow.theme as 'dark' | 'light' | 'system',
        currency: settingsRow.currency,
        notification_enabled: Boolean(settingsRow.notification_enabled),
        notification_days_before: JSON.parse(settingsRow.notification_days_before),
      }
    : {
        theme: 'dark' as const,
        currency: 'USD',
        notification_enabled: true,
        notification_days_before: [1, 3, 7],
      }

  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    subscriptions: subscriptions.map((s) => ({
      ...s,
      is_active: Boolean(s.is_active),
    })),
    categories: categories.map((c) => ({
      ...c,
      is_default: Boolean(c.is_default),
    })),
    payments,
    settings,
  }
}

export function downloadBackup(data: BackupData): void {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().split('T')[0]
  const filename = `subby-backup-${date}.json`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
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

  return true
}

export async function importData(
  data: BackupData,
  options: {
    clearExisting?: boolean
  } = {}
): Promise<{ success: boolean; message: string }> {
  const db = await getDatabase()

  try {
    if (options.clearExisting) {
      await db.execute('DELETE FROM payments')
      await db.execute('DELETE FROM subscriptions')
      await db.execute('DELETE FROM categories WHERE is_default = 0')
    }

    for (const category of data.categories) {
      if (category.is_default) continue

      await db.execute(
        `INSERT OR REPLACE INTO categories (id, name, color, icon, is_default, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          category.id,
          category.name,
          category.color,
          category.icon,
          0,
          category.created_at || new Date().toISOString(),
        ]
      )
    }

    for (const sub of data.subscriptions) {
      await db.execute(
        `INSERT OR REPLACE INTO subscriptions 
         (id, name, amount, currency, billing_cycle, billing_day, next_payment_date, category_id, color, logo_url, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          sub.id,
          sub.name,
          sub.amount,
          sub.currency,
          sub.billing_cycle,
          sub.billing_day,
          sub.next_payment_date,
          sub.category_id,
          sub.color,
          sub.logo_url,
          sub.notes,
          sub.is_active ? 1 : 0,
          sub.created_at || new Date().toISOString(),
          sub.updated_at || new Date().toISOString(),
        ]
      )
    }

    for (const payment of data.payments) {
      await db.execute(
        `INSERT OR REPLACE INTO payments (id, subscription_id, amount, paid_at, due_date, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payment.id,
          payment.subscription_id,
          payment.amount,
          payment.paid_at,
          payment.due_date,
          payment.status,
          payment.notes,
          payment.created_at || new Date().toISOString(),
        ]
      )
    }

    await db.execute(
      `UPDATE settings SET theme = ?, currency = ?, notification_enabled = ?, notification_days_before = ? WHERE id = ?`,
      [
        data.settings.theme,
        data.settings.currency,
        data.settings.notification_enabled ? 1 : 0,
        JSON.stringify(data.settings.notification_days_before),
        'singleton',
      ]
    )

    const subCount = data.subscriptions.length
    const catCount = data.categories.filter((c) => !c.is_default).length
    const payCount = data.payments.length

    return {
      success: true,
      message: `Imported ${subCount} subscriptions, ${catCount} categories, and ${payCount} payments`,
    }
  } catch (error) {
    return {
      success: false,
      message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
