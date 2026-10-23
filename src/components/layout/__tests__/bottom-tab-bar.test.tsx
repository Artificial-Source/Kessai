import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { BottomTabBar } from '../bottom-tab-bar'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomTabBar />
    </MemoryRouter>
  )
}

describe('BottomTabBar', () => {
  it('links to the four main pages', () => {
    renderAt('/')

    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    expect(within(nav).getAllByRole('link')).toHaveLength(4)
  })

  it('marks only the current page', () => {
    renderAt('/calendar')

    expect(screen.getByRole('link', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })

  it('does not treat the dashboard as active on nested pages', () => {
    renderAt('/settings')

    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current')
  })
})
