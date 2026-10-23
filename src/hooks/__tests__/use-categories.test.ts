import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCategories } from '../use-categories'
import { useCategoryStore } from '@/stores/category-store'
import type { Category } from '@/types/category'

const mockInvoke = vi.hoisted(() => vi.fn())
vi.mock('@/lib/api', () => ({ apiInvoke: (...args: unknown[]) => mockInvoke(...args) }))

const fetchCategories = useCategoryStore.getState().fetch

const mockCategories: Category[] = [
  {
    id: 'cat-1',
    name: 'Streaming',
    color: '#8b5cf6',
    icon: 'play-circle',
    is_default: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cat-2',
    name: 'Gaming',
    color: '#3b82f6',
    icon: 'gamepad-2',
    is_default: true,
    created_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 'cat-3',
    name: 'My Custom',
    color: '#10b981',
    icon: 'box',
    is_default: false,
    created_at: '2024-02-01T00:00:00Z',
  },
]

describe('useCategories', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    useCategoryStore.setState({
      categories: mockCategories,
      isLoading: false,
      error: null,
      fetch: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      getById: vi.fn(),
    })
  })

  it('returns categories from store', () => {
    const { result } = renderHook(() => useCategories())

    expect(result.current.categories).toEqual(mockCategories)
  })

  it('returns loading state', () => {
    useCategoryStore.setState({ isLoading: true })

    const { result } = renderHook(() => useCategories())

    expect(result.current.isLoading).toBe(true)
  })

  it('returns error state', () => {
    useCategoryStore.setState({ error: 'Failed to load' })

    const { result } = renderHook(() => useCategories())

    expect(result.current.error).toBe('Failed to load')
  })

  it('calls fetch on mount when categories are empty', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useCategoryStore.setState({ categories: [], fetch: mockFetch })

    renderHook(() => useCategories())

    expect(mockFetch).toHaveBeenCalled()
  })

  it('calls fetch once on mount when categories are already loaded', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useCategoryStore.setState({ categories: mockCategories, fetch: mockFetch })

    renderHook(() => useCategories())

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('calls fetch once on mount when the store is already loading', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useCategoryStore.setState({ categories: [], isLoading: true, fetch: mockFetch })

    renderHook(() => useCategories())

    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('does not refetch after a failed fetch and exposes the error until explicit retry', async () => {
    mockInvoke
      .mockRejectedValueOnce(new Error('categories offline'))
      .mockImplementation(() => new Promise(() => {}))
    useCategoryStore.setState({ categories: [], fetch: fetchCategories })

    const { result, rerender } = renderHook(() => useCategories())
    await act(async () => {})
    rerender()
    await act(async () => {})

    expect(mockInvoke.mock.calls.filter(([command]) => command === 'list_categories')).toHaveLength(
      1
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe('Error: categories offline')

    mockInvoke.mockResolvedValueOnce(mockCategories)
    await act(async () => result.current.refresh())
    expect(mockInvoke).toHaveBeenCalledTimes(2)
    expect(result.current.categories).toEqual(mockCategories)
    expect(result.current.error).toBeNull()
  })

  it('separates default and custom categories', () => {
    const { result } = renderHook(() => useCategories())

    expect(result.current.defaultCategories).toHaveLength(2)
    expect(result.current.customCategories).toHaveLength(1)
    expect(result.current.defaultCategories[0].name).toBe('Streaming')
    expect(result.current.customCategories[0].name).toBe('My Custom')
  })

  it('returns empty arrays when no categories', () => {
    useCategoryStore.setState({ categories: [] })

    const { result } = renderHook(() => useCategories())

    expect(result.current.defaultCategories).toHaveLength(0)
    expect(result.current.customCategories).toHaveLength(0)
  })

  it('exposes refresh as fetch', () => {
    const mockFetch = vi.fn().mockResolvedValue(undefined)
    useCategoryStore.setState({ fetch: mockFetch })

    const { result } = renderHook(() => useCategories())

    expect(result.current.refresh).toBe(mockFetch)
  })
})
