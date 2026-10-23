import { apiInvoke as invoke } from '@/lib/api'
import { getLogoDataUrl } from '@/lib/logo-storage'

// Cache of fetched logo results keyed by lowercased name
const fetchCache = new Map<string, string | null>()

/**
 * Fetch a logo for a subscription name via the Rust backend.
 * Returns a base64 data URL if found, or null.
 * Results are cached in-memory to avoid re-fetching.
 * @param name - Subscription name (used for cache key and fallback domain guessing)
 * @param domain - Optional known domain for the service (e.g. "netflix.com")
 */
export async function fetchLogoForName(
  name: string,
  domain?: string | null
): Promise<string | null> {
  const key = name.trim().toLowerCase()
  if (!key || key.length < 2) return null

  // Use domain-aware cache key when domain is provided
  const cacheKey = domain ? `${key}::${domain}` : key

  // Check cache (skip if previous attempt without domain failed but now we have a domain)
  if (fetchCache.has(cacheKey)) {
    const cached = fetchCache.get(cacheKey)!
    if (cached === null) return null
    // cached is a filename, resolve to data URL
    return getLogoDataUrl(cached)
  }

  try {
    const filename = await invoke('fetch_logo', {
      name,
      domain: domain ?? null,
    })
    fetchCache.set(cacheKey, filename)

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
