import { useState, useEffect, useCallback } from 'react'
import { apiInvoke as invoke } from '@/lib/api'
import type { MonthlySpend, YearSummary, SpendingVelocity, CategorySpend } from '@/types/analytics'

interface AnalyticsData {
  monthlySpending: MonthlySpend[]
  yearSummary: YearSummary | null
  velocity: SpendingVelocity | null
  categorySpending: CategorySpend[]
  isLoading: boolean
  error: string | null
}

/**
 * Fetches all analytics data from the backend.
 * Manages loading states and error handling.
 */
export function useAnalytics(year: number, months: number = 12) {
  const [data, setData] = useState<AnalyticsData>({
    monthlySpending: [],
    yearSummary: null,
    velocity: null,
    categorySpending: [],
    isLoading: true,
    error: null,
  })

  const fetchAll = useCallback(async () => {
    setData((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const results = await Promise.allSettled([
        invoke<MonthlySpend[]>('get_monthly_spending', { months }),
        invoke<YearSummary>('get_year_summary', { year }),
        invoke<SpendingVelocity>('get_spending_velocity'),
        invoke<CategorySpend[]>('get_category_spending', { months }),
      ])

      const errors: string[] = []
      const getValue = <T,>(result: PromiseSettledResult<T>, fallback: T): T => {
        if (result.status === 'fulfilled') return result.value
        errors.push(String(result.reason))
        return fallback
      }

      setData({
        monthlySpending: getValue(results[0], []),
        yearSummary: getValue(results[1], null),
        velocity: getValue(results[2], null),
        categorySpending: getValue(results[3], []),
        isLoading: false,
        error: errors.length > 0 ? errors.join('; ') : null,
      })
    } catch (err) {
      setData((prev) => ({
        ...prev,
        isLoading: false,
        error: String(err),
      }))
    }
  }, [year, months])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { ...data, refetch: fetchAll }
}
