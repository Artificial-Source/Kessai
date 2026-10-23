import { apiInvoke as invoke, type ApiCommands } from '@/lib/api'
import { isTauri } from '@tauri-apps/api/core'

const MAX_LOGO_BYTES = 5 * 1024 * 1024
const ALLOWED_LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const ALLOWED_LOGO_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif'])

// Share in-flight loads as well as resolved data URLs between cards.
const logoCache = new Map<string, Promise<string | null>>()

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result !== 'string' || !reader.result) {
        reject(new Error('The selected image could not be read.'))
        return
      }
      resolve(reader.result)
    })
    reader.addEventListener('error', () => {
      reject(new Error('The selected image could not be read. Try a different file.'))
    })
    reader.addEventListener('abort', () => reject(new Error('Image reading was cancelled.')))
    reader.readAsDataURL(file)
  })
}

function validateBrowserFile(file: File): void {
  if (file.size === 0) {
    throw new Error('The selected image is empty.')
  }
  if (file.size > MAX_LOGO_BYTES) {
    throw new Error('The selected image is larger than the 5 MiB limit.')
  }
  if (file.type && !ALLOWED_LOGO_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Choose a PNG, JPEG, WebP, or GIF image.')
  }
}

function chooseBrowserLogo(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'
    input.setAttribute('aria-label', 'Choose a custom subscription logo')
    input.className = 'sr-only'

    let settled = false
    const cleanup = () => {
      window.removeEventListener('focus', handleWindowFocus)
      input.remove()
    }
    const settle = (file: File | null) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(file)
    }
    const handleWindowFocus = () => {
      window.setTimeout(() => {
        if (!input.files?.length) settle(null)
      }, 0)
    }

    input.addEventListener('change', () => settle(input.files?.[0] ?? null), { once: true })
    input.addEventListener('cancel', () => settle(null), { once: true })
    window.addEventListener('focus', handleWindowFocus)
    document.body.append(input)
    input.click()
  })
}

export async function pickAndSaveLogo(subscriptionId: string): Promise<string | null> {
  let saveArgs: ApiCommands['save_logo']['args']

  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    const file = await open({
      multiple: false,
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })
    if (!file) return null

    const filePath = file as string
    if (!filePath) return null
    const extension = filePath.split('.').pop()?.toLowerCase()
    if (!extension || !ALLOWED_LOGO_EXTENSIONS.has(extension)) {
      throw new Error('Choose a PNG, JPEG, WebP, or GIF image.')
    }
    saveArgs = { sourcePath: filePath, subscriptionId }
  } else {
    const file = await chooseBrowserLogo()
    if (!file) return null
    validateBrowserFile(file)
    const data = await readFileAsDataUrl(file)
    saveArgs = { data, subscriptionId }
  }

  const filename = await invoke('save_logo', saveArgs)
  if (filename) logoCache.delete(filename)
  return filename
}

export async function getLogoDataUrl(filename: string): Promise<string | null> {
  if (!filename) return null

  if (logoCache.has(filename)) {
    return logoCache.get(filename)!
  }

  const loading = invoke('get_logo_base64', { filename }).catch((error) => {
    if (logoCache.get(filename) === loading) logoCache.delete(filename)
    console.error('Failed to load logo:', filename, error)
    return null
  })
  logoCache.set(filename, loading)
  return loading
}
