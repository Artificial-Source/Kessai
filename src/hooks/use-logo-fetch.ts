import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchLogoForName, getCachedLogoFilename } from '@/lib/logo-fetch'

type LogoFetchState = {
  /** Base64 data URL of the fetched logo */
  fetchedLogoPreview: string | null
  /** Whether a fetch is in progress */
  isFetchingLogo: boolean
  /** The filename to store (e.g. "fetched-netflix.webp") */
  fetchedLogoFilename: string | null
  /** Trigger a fetch for a given name, with an optional known domain */
  fetchLogo: (name: string, domain?: string | null) => void
  /** Clear the fetched logo state */
  clearFetchedLogo: () => void
}

/**
 * Hook that provides debounced logo fetching for subscription names.
 * @param debounceMs - Debounce delay in milliseconds (default 500)
 */
export function useLogoFetch(debounceMs = 500): LogoFetchState {
  const [fetchedLogoPreview, setFetchedLogoPreview] = useState<string | null>(null)
  const [isFetchingLogo, setIsFetchingLogo] = useState(false)
  const [fetchedLogoFilename, setFetchedLogoFilename] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef(false)

  const clearFetchedLogo = useCallback(() => {
    setFetchedLogoPreview(null)
    setFetchedLogoFilename(null)
  }, [])

  const fetchLogo = useCallback(
    (name: string, domain?: string | null) => {
      // Clear any pending debounce
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }

      const trimmed = name.trim()
      if (trimmed.length < 2) {
        setIsFetchingLogo(false)
        clearFetchedLogo()
        return
      }

      setIsFetchingLogo(true)
      abortRef.current = false

      timerRef.current = setTimeout(async () => {
        try {
          const dataUrl = await fetchLogoForName(trimmed, domain)
          if (abortRef.current) return

          if (dataUrl) {
            setFetchedLogoPreview(dataUrl)
            setFetchedLogoFilename(getCachedLogoFilename(trimmed))
          } else {
            clearFetchedLogo()
          }
        } catch {
          if (!abortRef.current) {
            clearFetchedLogo()
          }
        } finally {
          if (!abortRef.current) {
            setIsFetchingLogo(false)
          }
        }
      }, debounceMs)
    },
    [debounceMs, clearFetchedLogo]
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current = true
      if (timerRef.current) {
        clearTimeout(timerRef.current)
      }
    }
  }, [])

  return {
    fetchedLogoPreview,
    isFetchingLogo,
    fetchedLogoFilename,
    fetchLogo,
    clearFetchedLogo,
  }
}
