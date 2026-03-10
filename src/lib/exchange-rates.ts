import type { CurrencyCode } from '@/lib/currency'

/**
 * Exchange rate cache entry with TTL tracking.
 */
interface RateCache {
  /** Base currency for these rates */
  base: string
  /** Map of target currency -> exchange rate */
  rates: Record<string, number>
  /** Timestamp when rates were fetched */
  fetchedAt: number
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours
const STORAGE_KEY = 'subby-exchange-rates'
const API_BASE = 'https://api.frankfurter.app'

/** In-memory rate cache, keyed by base currency */
let memoryCache: Record<string, RateCache> = {}

/**
 * Load cached rates from localStorage as fallback.
 */
function loadFromStorage(): Record<string, RateCache> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as Record<string, RateCache>
    }
  } catch {
    // Ignore parse errors
  }
  return {}
}

/**
 * Save current cache to localStorage for offline fallback.
 */
function saveToStorage(cache: Record<string, RateCache>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // Ignore storage errors (quota, etc.)
  }
}

/**
 * Check if a cache entry is still fresh.
 */
function isCacheFresh(entry: RateCache): boolean {
  return Date.now() - entry.fetchedAt < CACHE_TTL_MS
}

/**
 * Fetch exchange rates from frankfurter.app for a given base currency.
 * Returns null on failure.
 */
async function fetchRates(base: string): Promise<Record<string, number> | null> {
  try {
    const response = await fetch(`${API_BASE}/latest?from=${base}`)
    if (!response.ok) return null
    const data = (await response.json()) as { base: string; rates: Record<string, number> }
    return data.rates
  } catch {
    return null
  }
}

/**
 * Get exchange rates for a base currency, using cache when available.
 * Falls back to localStorage cache, then to empty rates on failure.
 */
async function getRates(base: string): Promise<Record<string, number>> {
  // Check memory cache first
  const cached = memoryCache[base]
  if (cached && isCacheFresh(cached)) {
    return cached.rates
  }

  // Try fetching fresh rates
  const rates = await fetchRates(base)
  if (rates) {
    const entry: RateCache = { base, rates, fetchedAt: Date.now() }
    memoryCache[base] = entry
    saveToStorage(memoryCache)
    return rates
  }

  // Fall back to stale memory cache
  if (cached) {
    return cached.rates
  }

  // Fall back to localStorage cache (possibly from a previous session)
  const storedCache = loadFromStorage()
  if (storedCache[base]) {
    memoryCache = { ...memoryCache, ...storedCache }
    return storedCache[base].rates
  }

  // No cache available at all
  return {}
}

/**
 * Convert an amount from one currency to another.
 * Returns the original amount if currencies are the same or conversion is unavailable.
 *
 * @param amount - The amount to convert
 * @param from - Source currency code
 * @param to - Target currency code
 * @returns Converted amount (or original if conversion unavailable)
 *
 * @example
 * const usdAmount = await convertCurrency(9.99, 'EUR', 'USD')
 */
export async function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): Promise<number> {
  if (from === to) return amount

  const rates = await getRates(from)
  const rate = rates[to]

  if (rate !== undefined) {
    return amount * rate
  }

  // Try reverse conversion
  const reverseRates = await getRates(to)
  const reverseRate = reverseRates[from]

  if (reverseRate !== undefined && reverseRate !== 0) {
    return amount / reverseRate
  }

  // No rate available, return original amount (1:1 fallback)
  return amount
}

/**
 * Synchronous version that only uses cached rates.
 * Returns null if no cached rate is available.
 * Useful for rendering where async is inconvenient.
 *
 * @param amount - The amount to convert
 * @param from - Source currency code
 * @param to - Target currency code
 * @returns Converted amount or null if no cached rate exists
 */
export function convertCurrencyCached(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode
): number | null {
  if (from === to) return amount

  // Check memory cache
  const cached = memoryCache[from]
  if (cached !== undefined && cached.rates[to] !== undefined) {
    return amount * cached.rates[to]
  }

  // Try reverse
  const reverseCached = memoryCache[to]
  if (
    reverseCached !== undefined &&
    reverseCached.rates[from] !== undefined &&
    reverseCached.rates[from] !== 0
  ) {
    return amount / reverseCached.rates[from]
  }

  // Check localStorage cache
  const storedCache = loadFromStorage()
  if (storedCache[from] !== undefined && storedCache[from].rates[to] !== undefined) {
    memoryCache = { ...memoryCache, ...storedCache }
    return amount * storedCache[from].rates[to]
  }

  return null
}

/**
 * Preload exchange rates for a set of currencies.
 * Call this on app startup to ensure rates are available for synchronous lookups.
 *
 * @param currencies - Array of currency codes to preload rates for
 */
export async function preloadRates(currencies: CurrencyCode[]): Promise<void> {
  const unique = [...new Set(currencies)]
  await Promise.allSettled(unique.map((c) => getRates(c)))
}

/**
 * Get the cached exchange rate between two currencies.
 * Returns null if no rate is cached.
 */
export function getCachedRate(from: CurrencyCode, to: CurrencyCode): number | null {
  if (from === to) return 1

  const cached = memoryCache[from]
  if (cached !== undefined && cached.rates[to] !== undefined) {
    return cached.rates[to]
  }

  const reverseCached = memoryCache[to]
  if (
    reverseCached !== undefined &&
    reverseCached.rates[from] !== undefined &&
    reverseCached.rates[from] !== 0
  ) {
    return 1 / reverseCached.rates[from]
  }

  return null
}
