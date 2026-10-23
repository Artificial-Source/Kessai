import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

import { getLogoDataUrl, pickAndSaveLogo } from '../logo-storage'

function selectBrowserFile(file: File | null) {
  return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    Object.defineProperty(this, 'files', {
      configurable: true,
      value: file ? [file] : [],
    })
    this.dispatchEvent(new Event('change'))
  })
}

function cancelBrowserChooser() {
  return vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement
  ) {
    this.dispatchEvent(new Event('cancel'))
  })
}

describe('logo-storage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockIsTauri.mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.querySelectorAll('input[type="file"]').forEach((input) => input.remove())
  })

  describe('getLogoDataUrl', () => {
    it('returns null for empty filename', async () => {
      expect(await getLogoDataUrl('')).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('calls invoke, caches, and returns data URL', async () => {
      const dataUrl = 'data:image/png;base64,abc123'
      mockInvoke.mockResolvedValue(dataUrl)

      expect(await getLogoDataUrl('test-logo-1.png')).toBe(dataUrl)
      expect(await getLogoDataUrl('test-logo-1.png')).toBe(dataUrl)
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('shares one in-flight read between five cards requesting the same filename', async () => {
      const dataUrl = 'data:image/webp;base64,shared'
      let resolveRead!: (value: string) => void
      mockInvoke.mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })
      )

      const requests = Array.from({ length: 5 }, () => getLogoDataUrl('a.webp'))

      expect(mockInvoke).toHaveBeenCalledExactlyOnceWith('get_logo_base64', {
        filename: 'a.webp',
      })
      resolveRead(dataUrl)
      await expect(Promise.all(requests)).resolves.toEqual(Array(5).fill(dataUrl))
      expect(await getLogoDataUrl('a.webp')).toBe(dataUrl)
      expect(mockInvoke).toHaveBeenCalledTimes(1)
    })

    it('releases a failed in-flight read so a later request can retry', async () => {
      const dataUrl = 'data:image/webp;base64,retried'
      mockInvoke.mockRejectedValueOnce(new Error('File not found')).mockResolvedValueOnce(dataUrl)
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(
        Promise.all(Array.from({ length: 5 }, () => getLogoDataUrl('retry-shared.webp')))
      ).resolves.toEqual([null, null, null, null, null])
      expect(mockInvoke).toHaveBeenCalledTimes(1)
      expect(consoleSpy).toHaveBeenCalledTimes(1)
      expect(await getLogoDataUrl('retry-shared.webp')).toBe(dataUrl)
      expect(mockInvoke).toHaveBeenCalledTimes(2)
    })

    it('returns null on invoke error', async () => {
      mockInvoke.mockRejectedValue(new Error('File not found'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(await getLogoDataUrl('missing-logo.png')).toBeNull()
      expect(consoleSpy).toHaveBeenCalled()
    })
  })

  describe('Tauri logo selection', () => {
    it('returns null when no file is selected', async () => {
      mockOpen.mockResolvedValue(null)
      expect(await pickAndSaveLogo('sub-1')).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('keeps the native sourcePath DTO and invalidates cache', async () => {
      mockInvoke.mockResolvedValueOnce('data:image/png;base64,old')
      await getLogoDataUrl('sub-1.webp')
      mockOpen.mockResolvedValue('/path/to/image.PNG')
      mockInvoke.mockResolvedValueOnce('sub-1.webp')

      expect(await pickAndSaveLogo('sub-1')).toBe('sub-1.webp')
      expect(mockInvoke).toHaveBeenCalledWith('save_logo', {
        sourcePath: '/path/to/image.PNG',
        subscriptionId: 'sub-1',
      })

      mockInvoke.mockResolvedValueOnce('data:image/webp;base64,new')
      expect(await getLogoDataUrl('sub-1.webp')).toContain('new')
    })

    it('invalidates an in-flight read when replacing a logo without recaching its old result', async () => {
      let resolveRead!: (value: string) => void
      mockInvoke.mockReturnValueOnce(
        new Promise<string>((resolve) => {
          resolveRead = resolve
        })
      )
      const oldRead = getLogoDataUrl('replace-pending.webp')
      mockOpen.mockResolvedValue('/path/to/image.PNG')
      mockInvoke.mockResolvedValueOnce('replace-pending.webp')
      expect(await pickAndSaveLogo('replace-pending')).toBe('replace-pending.webp')

      const newDataUrl = 'data:image/webp;base64,replacement'
      mockInvoke.mockResolvedValueOnce(newDataUrl)
      expect(await getLogoDataUrl('replace-pending.webp')).toBe(newDataUrl)
      resolveRead('data:image/webp;base64,old')
      await oldRead

      expect(await getLogoDataUrl('replace-pending.webp')).toBe(newDataUrl)
      expect(mockInvoke).toHaveBeenCalledTimes(3)
    })

    it('rejects a native path with an unsupported extension', async () => {
      mockOpen.mockResolvedValue('/path/to/image.svg')
      await expect(pickAndSaveLogo('sub-1')).rejects.toThrow('PNG, JPEG, WebP, or GIF')
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })

  describe('browser logo selection', () => {
    beforeEach(() => mockIsTauri.mockReturnValue(false))

    it('reads and saves a selected image data URL and cleans up the input', async () => {
      const file = new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })
      selectBrowserFile(file)
      mockInvoke.mockResolvedValue('sub-web.webp')

      expect(await pickAndSaveLogo('sub-web')).toBe('sub-web.webp')
      expect(mockInvoke).toHaveBeenCalledWith('save_logo', {
        data: expect.stringMatching(/^data:image\/png;base64,/),
        subscriptionId: 'sub-web',
      })
      expect(document.querySelector('input[type="file"]')).toBeNull()
    })

    it('returns null on cancel and cleans up the input', async () => {
      cancelBrowserChooser()
      expect(await pickAndSaveLogo('sub-web')).toBeNull()
      expect(mockInvoke).not.toHaveBeenCalled()
      expect(document.querySelector('input[type="file"]')).toBeNull()
    })

    it.each([
      [new File([], 'empty.png', { type: 'image/png' }), 'empty'],
      [new File(['hello'], 'logo.svg', { type: 'image/svg+xml' }), 'PNG, JPEG, WebP, or GIF'],
      [new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' }), '5 MiB'],
    ])('rejects invalid browser file %#', async (file, message) => {
      selectBrowserFile(file)
      await expect(pickAndSaveLogo('sub-web')).rejects.toThrow(message)
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('rejects a file read error with an actionable message', async () => {
      selectBrowserFile(new File(['image'], 'logo.png', { type: 'image/png' }))
      vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(function (
        this: FileReader
      ) {
        this.dispatchEvent(new ProgressEvent('error'))
      })

      await expect(pickAndSaveLogo('sub-web')).rejects.toThrow('Try a different file')
      expect(mockInvoke).not.toHaveBeenCalled()
    })
  })
})
