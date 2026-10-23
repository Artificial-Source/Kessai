import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logger } from '../logger'

describe('logger retention and unavailable storage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
    logger.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    logger.clear()
    vi.useRealTimers()
  })

  it('bounds in-memory logs to 500 and persisted warnings to 200 newest entries', () => {
    for (let i = 0; i < 600; i++) logger.warn('qa', `Warning ${i}`)
    const logs = logger.getLogs()
    expect(logs).toHaveLength(500)
    expect(logs[0].message).toBe('Warning 100')
    expect(logs[499].message).toBe('Warning 599')
    const persisted = JSON.parse(localStorage.getItem('kessai-logs')!)
    expect(persisted).toHaveLength(200)
    expect(persisted[0].message).toBe('Warning 400')
    expect(persisted[199].message).toBe('Warning 599')
  })

  it('retains logs and recovers persistence after a quota error', () => {
    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    expect(() => logger.error('qa', 'Could not save', new Error('Disk full'))).not.toThrow()
    expect(logger.getLogs()).toMatchObject([
      { message: 'Could not save: Disk full', level: 'error' },
    ])
    storage.mockRestore()
    logger.warn('qa', 'Recovered')
    expect(JSON.parse(localStorage.getItem('kessai-logs')!)).toMatchObject([
      { message: 'Could not save: Disk full' },
      { message: 'Recovered' },
    ])
  })
})
