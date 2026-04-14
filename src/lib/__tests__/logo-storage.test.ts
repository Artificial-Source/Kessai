import { describe, it, expect, beforeEach, vi } from 'vitest'

const mockInvoke = vi.fn()
const mockOpen = vi.fn()
const mockIsTauri = vi.fn(() => true)

vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => mockOpen(...args),
}))

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => mockIsTauri(),
}))

// Import after mocking
import { getLogoDataUrl, pickAndSaveLogo } from '../logo-storage'

describe('logo-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTauri.mockReturnValue(true)
    // We need to clear the internal cache. Since it's module-scoped,
    // we can reset it by testing with different filenames each time.
  })

  describe('getLogoDataUrl', () => {
    it('returns null for empty filename', async () => {
      const result = await getLogoDataUrl('')
      expect(result).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('calls invoke and returns data URL', async () => {
      const mockDataUrl = 'data:image/png;base64,abc123'
      mockInvoke.mockResolvedValue(mockDataUrl)

      const result = await getLogoDataUrl('test-logo-1.png')

      expect(mockInvoke).toHaveBeenCalledWith('get_logo_base64', { filename: 'test-logo-1.png' })
      expect(result).toBe(mockDataUrl)
    })

    it('returns cached data on second call', async () => {
      const mockDataUrl = 'data:image/png;base64,cached123'
      mockInvoke.mockResolvedValue(mockDataUrl)

      // First call
      await getLogoDataUrl('cached-logo.png')
      // Second call should use cache
      const result = await getLogoDataUrl('cached-logo.png')

      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(result).toBe(mockDataUrl)
    })

    it('returns null on invoke error', async () => {
      mockInvoke.mockRejectedValue(new Error('File not found'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const result = await getLogoDataUrl('missing-logo.png')

      expect(result).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
      consoleSpy.mockRestore()
    })
  })

  describe('pickAndSaveLogo', () => {
    it('returns null outside Tauri', async () => {
      mockIsTauri.mockReturnValue(false)

      const result = await pickAndSaveLogo('sub-1')

      expect(result).toBeNull()
      expect(mockOpen).not.toHaveBeenCalled()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('returns null when no file is selected', async () => {
      mockOpen.mockResolvedValue(null)

      const result = await pickAndSaveLogo('sub-1')

      expect(result).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('saves logo and returns filename', async () => {
      mockOpen.mockResolvedValue('/path/to/image.png')
      mockInvoke.mockResolvedValue('saved-logo.png')

      const result = await pickAndSaveLogo('sub-1')

      expect(mockInvoke).toHaveBeenCalledWith('save_logo', {
        sourcePath: '/path/to/image.png',
        subscriptionId: 'sub-1',
      })
      expect(result).toBe('saved-logo.png')
    })

    it('invalidates cache after saving', async () => {
      // First, cache a logo
      const mockDataUrl = 'data:image/png;base64,old'
      mockInvoke.mockResolvedValue(mockDataUrl)
      await getLogoDataUrl('invalidated-logo.png')

      // Now save a new logo with the same filename
      mockOpen.mockResolvedValue('/path/to/new-image.png')
      mockInvoke.mockResolvedValue('invalidated-logo.png')
      await pickAndSaveLogo('sub-1')

      // Next getLogoDataUrl should call invoke again (cache was cleared)
      const newDataUrl = 'data:image/png;base64,new'
      mockInvoke.mockResolvedValue(newDataUrl)
      const result = await getLogoDataUrl('invalidated-logo.png')

      expect(result).toBe(newDataUrl)
    })

    it('returns null when open returns empty string', async () => {
      mockOpen.mockResolvedValue('')

      const result = await pickAndSaveLogo('sub-1')

      expect(result).toBeNull()
    })
  })
})
