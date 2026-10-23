import { useEffect, useState } from 'react'
import { apiInvoke, type PriceChange } from '@/lib/api'

/** Days of price history the dashboard reads for recorded price changes. */
export const PRICE_CHANGE_DAYS = 90

type PriceChangesState = { changes: PriceChange[]; error: string | null }

/**
 * Recorded price changes from the last 90 days. Reads again whenever `revision` changes,
 * e.g. a signature of every subscription's amount and currency, since an edit there is
 * what records a change.
 */
export function useRecentPriceChanges(revision: string): PriceChangesState {
  const [state, setState] = useState<PriceChangesState>({ changes: [], error: null })

  useEffect(() => {
    let live = true
    apiInvoke('get_recent_price_changes', { days: PRICE_CHANGE_DAYS }).then(
      (changes) => {
        if (live) setState({ changes: Array.isArray(changes) ? changes : [], error: null })
      },
      (error: unknown) => {
        // Keep the last good list; Decisions says the history could not be read.
        if (live) setState((previous) => ({ ...previous, error: String(error) }))
      }
    )
    return () => {
      live = false
    }
  }, [revision])

  return state
}
