import { invoke } from '@tauri-apps/api/core'
import { getLogoDataUrl } from '@/lib/logo-storage'

// Cache of fetched logo results keyed by lowercased name
const fetchCache = new Map<string, string | null>()

/**
 * Fetch a logo for a subscription name via the Rust backend.
 * Returns a base64 data URL if found, or null.
 * Results are cached in-memory to avoid re-fetching.
 */
export async function fetchLogoForName(name: string): Promise<string | null> {
  const key = name.trim().toLowerCase()
  if (!key || key.length < 2) return null

  // Check cache
  if (fetchCache.has(key)) {
    const cached = fetchCache.get(key)!
    if (cached === null) return null
    // cached is a filename, resolve to data URL
    return getLogoDataUrl(cached)
  }

  try {
    const filename = await invoke<string | null>('fetch_logo', { name })
    fetchCache.set(key, filename)

    if (filename) {
      return getLogoDataUrl(filename)
    }
    return null
  } catch (error) {
    console.error('Logo fetch failed for:', name, error)
    fetchCache.set(key, null)
    return null
  }
}

/**
 * Get the cached filename (not data URL) for a name, if it was previously fetched.
 */
export function getCachedLogoFilename(name: string): string | null {
  const key = name.trim().toLowerCase()
  return fetchCache.get(key) ?? null
}
