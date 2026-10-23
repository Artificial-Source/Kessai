import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NotFoundPage } from '../not-found'
import { useUiStore } from '@/stores/ui-store'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<h1>Dashboard</h1>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('NotFoundPage', () => {
  afterEach(() => {
    useUiStore.setState({ commandPaletteOpen: false })
  })

  it('names the missing path and offers a way home', () => {
    renderAt('/subscriptons')

    expect(screen.getByRole('heading', { level: 1, name: 'Page not found' })).toBeInTheDocument()
    expect(screen.getByText('/subscriptons')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Back to Dashboard' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
  })

  it('opens the command palette to search instead', () => {
    renderAt('/nope')

    fireEvent.click(screen.getByRole('button', { name: /search/i }))

    expect(useUiStore.getState().commandPaletteOpen).toBe(true)
  })
})
