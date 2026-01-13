import { open } from '@tauri-apps/plugin-dialog'
import { invoke } from '@tauri-apps/api/core'

export async function pickAndSaveLogo(subscriptionId: string): Promise<string | null> {
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

  return filename
}

export async function getLogoDataUrl(filename: string): Promise<string | null> {
  if (!filename) return null

  try {
    const dataUrl = await invoke<string>('get_logo_base64', { filename })
    return dataUrl
  } catch {
    return null
  }
}

export async function deleteLogo(filename: string): Promise<void> {
  if (!filename) return

  try {
    await invoke('delete_logo', { filename })
  } catch {
    // Silently ignore deletion errors - logo may not exist
  }
}
