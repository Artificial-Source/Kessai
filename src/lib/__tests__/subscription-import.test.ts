import { describe, expect, it, vi } from 'vitest'
import { importSubscriptions, type SubscriptionImportRow } from '../subscription-import'
import type { NewSubscription } from '@/types/subscription'

const row = (name: string, sourceRow: number): SubscriptionImportRow => ({
  name,
  amount: 9.99,
  currency: 'USD',
  billing_cycle: 'monthly',
  row: sourceRow,
})

const options = () => ({
  existingNames: [] as string[],
  categories: [] as { id: string; name: string }[],
  duplicateMode: 'skip' as const,
  missingCategory: 'ignore' as const,
  addSubscription: vi.fn().mockResolvedValue({ id: 'saved' }),
  defaultCurrency: 'USD',
})

describe('subscription import application', () => {
  it('imports zero-amount subscriptions and fails negative amounts', async () => {
    const dependencies = options()
    const outcome = await importSubscriptions(
      [
        { ...row('Free tier', 2), amount: 0 },
        { ...row('Refund', 3), amount: -1 },
      ],
      dependencies
    )
    expect(outcome.imported).toBe(1)
    expect(outcome.failed).toEqual([{ row: 3, reason: expect.stringMatching(/zero or more/) }])
    expect(dependencies.addSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Free tier', amount: 0 })
    )
  })

  it('reserves names within the batch under the skip policy', async () => {
    const dependencies = options()
    const outcome = await importSubscriptions([row('Service', 2), row('service', 3)], dependencies)
    expect(outcome).toEqual({
      imported: 1,
      skipped: 1,
      failed: [],
      rows: [
        { row: 2, status: 'imported', name: 'Service' },
        { row: 3, status: 'skipped', name: 'service' },
      ],
    })
    expect(dependencies.addSubscription).toHaveBeenCalledTimes(1)
  })

  it('renames collisions safely against both existing names and later batch names', async () => {
    const dependencies = {
      ...options(),
      duplicateMode: 'rename' as const,
      existingNames: ['Service', 'Service (imported)'],
    }
    const outcome = await importSubscriptions(
      [row('Service', 2), row('Service', 3), row('Service (imported 2)', 4)],
      dependencies
    )
    expect(outcome).toMatchObject({ imported: 3, skipped: 0, failed: [] })
    const names = dependencies.addSubscription.mock.calls.map(([data]) => data.name)
    expect(new Set(names).size).toBe(3)
    expect(names).not.toContain('Service')
    expect(names).not.toContain('Service (imported)')
  })

  it('returns exact failed rows and does not swallow partial or total failure', async () => {
    const dependencies = options()
    dependencies.addSubscription.mockRejectedValueOnce(new Error('Disk full'))
    const result = await importSubscriptions([row('Failed', 2), row('Saved', 3)], dependencies)
    expect(result).toEqual({
      imported: 1,
      skipped: 0,
      failed: [{ row: 2, reason: 'Disk full' }],
      rows: [
        { row: 2, status: 'failed', name: 'Failed', reason: 'Disk full' },
        { row: 3, status: 'imported', name: 'Saved' },
      ],
    })
    dependencies.addSubscription.mockRejectedValue(new Error('Offline'))
    expect(await importSubscriptions([row('Failed again', 4)], dependencies)).toMatchObject({
      imported: 0,
      skipped: 0,
      failed: [{ row: 4, reason: 'Offline' }],
    })
  })

  it('creates a missing category once and shares its persisted id across the batch', async () => {
    const dependencies = {
      ...options(),
      missingCategory: 'create' as const,
      createCategory: vi.fn().mockResolvedValue({ id: 'category-id', name: 'Media' }),
    }
    const result = await importSubscriptions(
      [
        { ...row('Video', 2), category_name: 'Media' },
        { ...row('Audio', 3), category_name: 'media' },
      ],
      dependencies
    )
    expect(result.imported).toBe(2)
    expect(dependencies.createCategory).toHaveBeenCalledOnce()
    expect(dependencies.addSubscription.mock.calls.map(([data]) => data.category_id)).toEqual([
      'category-id',
      'category-id',
    ])
  })

  it('matches existing categories and ignores missing categories only under declared policy', async () => {
    const dependencies = { ...options(), categories: [{ id: 'known', name: 'Media' }] }
    await importSubscriptions(
      [
        { ...row('Video', 2), category_name: ' media ' },
        { ...row('Audio', 3), category_name: 'Unknown' },
      ],
      dependencies
    )
    expect(dependencies.addSubscription.mock.calls.map(([data]) => data.category_id)).toEqual([
      'known',
      null,
    ])
  })

  it('reports category-creation failures as row failures without creating the subscription', async () => {
    const dependencies = {
      ...options(),
      missingCategory: 'create' as const,
      createCategory: vi.fn().mockRejectedValue(new Error('Category failed')),
    }
    const result = await importSubscriptions(
      [{ ...row('Video', 2), category_name: 'Media' }],
      dependencies
    )
    expect(result.failed).toEqual([{ row: 2, reason: 'Category failed' }])
    expect(dependencies.addSubscription).not.toHaveBeenCalled()
  })

  it('keeps renamed names inside the normal name limit', async () => {
    const name = 's'.repeat(100)
    const dependencies = { ...options(), duplicateMode: 'rename' as const, existingNames: [name] }
    expect((await importSubscriptions([row(name, 2)], dependencies)).imported).toBe(1)
    expect(dependencies.addSubscription.mock.calls[0][0].name).toHaveLength(100)
  })

  it('creates each of 500 new categories once and attaches its saved identity', async () => {
    const categories = new Map<string, { id: string; name: string }>()
    const saved: NewSubscription[] = []
    const result = await importSubscriptions(
      Array.from({ length: 500 }, (_, i) => ({
        ...row(`Service ${i}`, i + 2),
        category_name: `Category ${i}`,
      })),
      {
        ...options(),
        missingCategory: 'create',
        createCategory: async (name) => {
          if (categories.has(name)) throw new Error('Category already exists')
          const category = { id: `category-${categories.size + 1}`, name }
          categories.set(name, category)
          return category
        },
        addSubscription: async (data) => {
          saved.push(data)
        },
      }
    )
    expect(result).toMatchObject({ imported: 500, skipped: 0, failed: [] })
    expect(categories.size).toBe(500)
    expect(saved).toHaveLength(500)
    expect(new Set(saved.map((subscription) => subscription.category_id)).size).toBe(500)
    expect(saved[499]).toMatchObject({ name: 'Service 499', category_id: 'category-500' })
  })

  it('applies skip policy to case and whitespace variants of existing and new names', async () => {
    const dependencies = { ...options(), existingNames: ['  NETFLIX  '] }
    const result = await importSubscriptions(
      [row(' netflix ', 2), row(' Music ', 3), row('MUSIC', 4)],
      dependencies
    )
    expect(result).toMatchObject({ imported: 1, skipped: 2, failed: [] })
    expect(dependencies.addSubscription.mock.calls[0][0].name).toBe('Music')
  })

  it('renames case and whitespace collisions using the same name policy', async () => {
    const dependencies = {
      ...options(),
      existingNames: ['  SERVICE  '],
      duplicateMode: 'rename' as const,
    }
    const result = await importSubscriptions([row(' service ', 2), row('SERVICE', 3)], dependencies)
    expect(result).toEqual({
      imported: 2,
      skipped: 0,
      failed: [],
      rows: [
        { row: 2, status: 'imported', name: 'service (imported)' },
        { row: 3, status: 'imported', name: 'SERVICE (imported 2)' },
      ],
    })
    expect(dependencies.addSubscription.mock.calls.map(([data]) => data.name)).toEqual([
      'service (imported)',
      'SERVICE (imported 2)',
    ])
  })

  it('reports the third of five failed creates and retries without duplicating saved names', async () => {
    const saved = new Map<string, NewSubscription>()
    let attempts = 0
    const rows = ['One', 'Two', 'Three', 'Four', 'Five'].map((name, i) => row(name, i + 2))
    const dependencies = {
      ...options(),
      addSubscription: async (data: NewSubscription) => {
        if (++attempts === 3) throw new Error('Disk full')
        if (saved.has(data.name)) throw new Error('Duplicate subscription')
        saved.set(data.name, data)
      },
    }
    expect(await importSubscriptions(rows, dependencies)).toMatchObject({
      imported: 4,
      skipped: 0,
      failed: [{ row: 4, reason: 'Disk full' }],
    })
    expect([...saved.keys()]).toEqual(['One', 'Two', 'Four', 'Five'])
    expect(
      await importSubscriptions(rows, { ...dependencies, existingNames: saved.keys() })
    ).toMatchObject({
      imported: 1,
      skipped: 4,
      failed: [],
    })
    expect(saved.size).toBe(5)
    expect(attempts).toBe(6)
  })
})
