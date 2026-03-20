import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useTrialCountdown } from '../use-trial-countdown'
import dayjs from 'dayjs'

describe('useTrialCountdown', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null values for no trial date', () => {
    const { result } = renderHook(() => useTrialCountdown(null))

    expect(result.current.daysRemaining).toBeNull()
    expect(result.current.isExpiringSoon).toBe(false)
    expect(result.current.isExpired).toBe(false)
    expect(result.current.formattedCountdown).toBeNull()
  })

  it('returns null values for undefined trial date', () => {
    const { result } = renderHook(() => useTrialCountdown(undefined))

    expect(result.current.daysRemaining).toBeNull()
    expect(result.current.formattedCountdown).toBeNull()
  })

  it('returns correct days remaining for future date', () => {
    const futureDate = dayjs().add(10, 'day').format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(futureDate))

    expect(result.current.daysRemaining).toBe(10)
    expect(result.current.isExpired).toBe(false)
    expect(result.current.isExpiringSoon).toBe(false)
    expect(result.current.formattedCountdown).toBe('10 days left')
  })

  it('returns "1 day left" for tomorrow', () => {
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(tomorrow))

    expect(result.current.daysRemaining).toBe(1)
    expect(result.current.isExpiringSoon).toBe(true)
    expect(result.current.formattedCountdown).toBe('1 day left')
  })

  it('returns "Ends today" for today', () => {
    const today = dayjs().format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(today))

    expect(result.current.daysRemaining).toBe(0)
    expect(result.current.isExpiringSoon).toBe(true)
    expect(result.current.isExpired).toBe(false)
    expect(result.current.formattedCountdown).toBe('Ends today')
  })

  it('handles expired trials with negative days', () => {
    const pastDate = dayjs().subtract(5, 'day').format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(pastDate))

    expect(result.current.daysRemaining).toBe(-5)
    expect(result.current.isExpired).toBe(true)
    expect(result.current.isExpiringSoon).toBe(false)
    expect(result.current.formattedCountdown).toBe('Expired')
  })

  it('marks expiring soon when 3 days or less remain', () => {
    const threeDays = dayjs().add(3, 'day').format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(threeDays))

    expect(result.current.daysRemaining).toBe(3)
    expect(result.current.isExpiringSoon).toBe(true)
    expect(result.current.formattedCountdown).toBe('3 days left')
  })

  it('does not mark expiring soon when more than 3 days remain', () => {
    const fourDays = dayjs().add(4, 'day').format('YYYY-MM-DD')
    const { result } = renderHook(() => useTrialCountdown(fourDays))

    expect(result.current.daysRemaining).toBe(4)
    expect(result.current.isExpiringSoon).toBe(false)
  })
})
