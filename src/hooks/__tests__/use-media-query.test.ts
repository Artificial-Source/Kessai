import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useMediaQuery } from '../use-media-query'

describe('useMediaQuery', () => {
  let listeners: Map<string, ((e: MediaQueryListEvent) => void)[]>
  let matchesMap: Map<string, boolean>

  beforeEach(() => {
    listeners = new Map()
    matchesMap = new Map()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: matchesMap.get(query) ?? false,
        media: query,
        onchange: null,
        addEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            const existing = listeners.get(query) || []
            existing.push(handler)
            listeners.set(query, existing)
          }
        }),
        removeEventListener: vi.fn((event: string, handler: (e: MediaQueryListEvent) => void) => {
          if (event === 'change') {
            const existing = listeners.get(query) || []
            listeners.set(
              query,
              existing.filter((h) => h !== handler)
            )
          }
        }),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  it('returns true when media query matches', () => {
    matchesMap.set('(min-width: 768px)', true)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(true)
  })

  it('returns false when media query does not match', () => {
    matchesMap.set('(min-width: 768px)', false)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(false)
  })

  it('updates when media query changes', () => {
    matchesMap.set('(min-width: 768px)', false)

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(result.current).toBe(false)

    // Simulate media query change
    act(() => {
      const handlers = listeners.get('(min-width: 768px)') || []
      handlers.forEach((handler) => handler({ matches: true } as MediaQueryListEvent))
    })

    expect(result.current).toBe(true)
  })

  it('registers and cleans up event listener', () => {
    const addSpy = vi.fn()
    const removeSpy = vi.fn()

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: addSpy,
        removeEventListener: removeSpy,
        dispatchEvent: vi.fn(),
      })),
    })

    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))

    expect(addSpy).toHaveBeenCalledWith('change', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('handles different query strings', () => {
    matchesMap.set('(prefers-color-scheme: dark)', true)

    const { result } = renderHook(() => useMediaQuery('(prefers-color-scheme: dark)'))

    expect(result.current).toBe(true)
  })

  it('re-evaluates when query prop changes', () => {
    matchesMap.set('(min-width: 768px)', true)
    matchesMap.set('(min-width: 1024px)', false)

    const { result, rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(min-width: 768px)' },
    })

    expect(result.current).toBe(true)

    rerender({ query: '(min-width: 1024px)' })

    expect(result.current).toBe(false)
  })
})
