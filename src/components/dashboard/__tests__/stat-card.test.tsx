import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Star } from 'lucide-react'
import { StatCard } from '../stat-card'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

describe('StatCard', () => {
  const defaultProps = {
    label: 'Monthly Cost',
    value: '$42.00',
    icon: Star,
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-500',
  }

  it('renders label, value, and icon', () => {
    render(<StatCard {...defaultProps} />)

    expect(screen.getByText('Monthly Cost')).toBeInTheDocument()
    expect(screen.getByText('$42.00')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<StatCard {...defaultProps} subtitle="per month" />)

    expect(screen.getByText('per month')).toBeInTheDocument()
  })

  it('renders without subtitle', () => {
    render(<StatCard {...defaultProps} />)

    expect(screen.queryByText('per month')).not.toBeInTheDocument()
  })

  it('applies subtitleColor class when provided', () => {
    render(<StatCard {...defaultProps} subtitle="over budget" subtitleColor="text-destructive" />)

    const subtitle = screen.getByText('over budget')
    expect(subtitle).toHaveClass('text-destructive')
  })
})
