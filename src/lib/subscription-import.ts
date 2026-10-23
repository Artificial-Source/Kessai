import dayjs from 'dayjs'
import { billingCycleSchema, type NewSubscription } from '@/types/subscription'
import type { ParsedSubscription } from './import-parsers'
import { MAX_IMPORT_NAME_LENGTH, parseImportDate, validateImportFields } from './csv-parser'

export interface SubscriptionImportRow extends ParsedSubscription {
  row: number
  next_payment_date?: string
}

export type SubscriptionImportStatus = 'imported' | 'skipped' | 'failed'

export interface SubscriptionImportRowOutcome {
  row: number
  status: SubscriptionImportStatus
  /** Name as saved: carries the "(imported)" suffix when the rename policy applied. */
  name: string
  /** Why the row failed; set only for failed rows. */
  reason?: string
}

export interface SubscriptionImportOutcome {
  imported: number
  skipped: number
  failed: { row: number; reason: string }[]
  /** One entry per input row, in input order. */
  rows: SubscriptionImportRowOutcome[]
}

export interface SubscriptionImportOptions {
  existingNames: Iterable<string>
  categories: readonly { id: string; name: string }[]
  duplicateMode: 'skip' | 'rename'
  missingCategory: 'ignore' | 'create'
  createCategory?: (name: string) => Promise<{ id: string; name: string }>
  addSubscription: (data: NewSubscription) => Promise<unknown>
  defaultCurrency: string
}

const nameKey = (name: string) => name.trim().toLowerCase()

/** Applies one batch sequentially so names and newly-created categories are reserved before the next row. */
export async function importSubscriptions(
  rows: SubscriptionImportRow[],
  options: SubscriptionImportOptions
): Promise<SubscriptionImportOutcome> {
  const result: SubscriptionImportOutcome = { imported: 0, skipped: 0, failed: [], rows: [] }
  const reserved = new Set(Array.from(options.existingNames, nameKey))
  // Do not take a later row's original name when generating a duplicate suffix.
  const originalNames = new Set(rows.map((row) => nameKey(row.name)))
  const categories = new Map(
    options.categories.map((category) => [nameKey(category.name), category.id])
  )
  const today = dayjs().format('YYYY-MM-DD')

  for (const sub of rows) {
    try {
      let name = sub.name.trim()
      validateImportFields(name, sub.notes, sub.category_name)
      if (!Number.isFinite(sub.amount) || sub.amount < 0)
        throw new Error('Invalid amount; must be finite and zero or more')
      if (!billingCycleSchema.safeParse(sub.billing_cycle).success)
        throw new Error('Invalid billing cycle')
      if (reserved.has(nameKey(name))) {
        if (options.duplicateMode === 'skip') {
          result.skipped++
          result.rows.push({ row: sub.row, status: 'skipped', name })
          continue
        }
        let suffixNumber = 1
        do {
          const suffix = suffixNumber === 1 ? ' (imported)' : ` (imported ${suffixNumber})`
          name = `${sub.name.trim().slice(0, MAX_IMPORT_NAME_LENGTH - suffix.length)}${suffix}`
          suffixNumber++
        } while (reserved.has(nameKey(name)) || originalNames.has(nameKey(name)))
      }
      reserved.add(nameKey(name))

      let categoryId: string | null = null
      const categoryName = sub.category_name?.trim()
      if (categoryName) {
        const key = nameKey(categoryName)
        categoryId = categories.get(key) ?? null
        if (!categoryId && options.missingCategory === 'create') {
          if (!options.createCategory) throw new Error('Category creation is unavailable')
          const created = await options.createCategory(categoryName)
          categoryId = created.id
          categories.set(key, categoryId)
        }
      }
      const nextDate = sub.next_payment_date || sub.start_date
      await options.addSubscription({
        name,
        amount: sub.amount,
        currency: sub.currency || options.defaultCurrency,
        billing_cycle: sub.billing_cycle,
        billing_day: null,
        category_id: categoryId,
        color: null,
        notes: sub.notes ?? null,
        is_active: true,
        status: 'active',
        shared_count: 1,
        is_pinned: false,
        next_payment_date: nextDate ? parseImportDate(nextDate) : today,
      })
      result.imported++
      result.rows.push({ row: sub.row, status: 'imported', name })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      result.failed.push({ row: sub.row, reason })
      result.rows.push({ row: sub.row, status: 'failed', name: sub.name.trim(), reason })
    }
  }
  return result
}
