import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCategoryStore } from '@/stores/category-store'
import type { Category } from '@/types/category'

const { toastError, toastSuccess } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { error: toastError, success: toastSuccess } }))

import { CategoryManager } from '../category-manager'

const category = (overrides: Partial<Category>): Category => ({
  id: 'category',
  name: 'Category',
  color: '#3b82f6',
  icon: 'box',
  is_default: false,
  created_at: '2024-01-01T00:00:00.000Z',
  ...overrides,
})

const categories = [
  category({ id: 'cat-streaming', name: 'Streaming', is_default: true }),
  category({ id: 'cat-cloud', name: 'Cloud Storage', is_default: true }),
  category({ id: 'cat-hobby', name: 'Pottery Studio' }),
]

const rowNames = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent)

beforeEach(() => {
  toastError.mockReset()
  toastSuccess.mockReset()
  useCategoryStore.setState({
    categories,
    isLoading: false,
    error: null,
    fetch: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  })
})

afterEach(cleanup)

describe('CategoryManager', () => {
  it('groups built-in categories under Built-in without a Delete that always fails', () => {
    render(<CategoryManager />)

    const builtIn = screen.getByRole('list', { name: 'Built-in' })
    expect(builtIn).toHaveAccessibleDescription(
      "These come with Kessai and can't be edited or deleted."
    )
    expect(rowNames(builtIn)).toEqual(['Streaming', 'Cloud Storage'])
    expect(within(builtIn).queryAllByRole('button')).toEqual([])

    const custom = screen.getByRole('list', { name: 'Custom' })
    expect(rowNames(custom)).toEqual(['Pottery Studio'])
    expect(within(custom).getByRole('button', { name: 'Edit Pottery Studio' })).toBeVisible()
    expect(within(custom).getByRole('button', { name: 'Delete Pottery Studio' })).toBeVisible()
  })

  it('shows the server reason when deleting a custom category fails', async () => {
    useCategoryStore.setState({
      remove: vi.fn().mockRejectedValue(new Error('Category is still in use')),
    })
    render(<CategoryManager />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete Pottery Studio' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete Pottery Studio?' })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete category' }))

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't delete Pottery Studio", {
        description: 'Category is still in use',
      })
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })
})
