import { apiInvoke as invoke } from '@/lib/api'
import { isTauri } from '@tauri-apps/api/core'

// In-memory cache for logo data URLs
const logoCache = new Map<string, string>()

export async function pickAndSaveLogo(subscriptionId: string): Promise<string | null> {
  if (!isTauri()) {
    // In web mode, use a file input instead
    // For now, return null — logo upload in web mode can be added later
    return null
  }

  const { open } = await import('@tauri-apps/plugin-dialog')

  const file = await open({
    multiple: false,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })

  if (!file) return null

  const filePath = file as string
  if (!filePath) return null

  const filename = await invoke<string>('save_logo', {
    sourcePath: filePath,
    subscriptionId,
  })

  // Clear cache for this filename since it was just updated
  if (filename) {
    logoCache.delete(filename)
  }

  return filename
}

export async function getLogoDataUrl(filename: string): Promise<string | null> {
  if (!filename) return null

  // Check cache first
  if (logoCache.has(filename)) {
    return logoCache.get(filename)!
  }

  try {
    const dataUrl = await invoke<string>('get_logo_base64', { filename })
    // Cache the result
    logoCache.set(filename, dataUrl)
    return dataUrl
  } catch (error) {
    console.error('Failed to load logo:', filename, error)
    return null
  }
}
