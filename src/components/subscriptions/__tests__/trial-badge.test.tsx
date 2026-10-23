import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import dayjs from 'dayjs'
import { TrialBadge } from '../trial-badge'

const inDays = (days: number) => dayjs().startOf('day').add(days, 'day').format('YYYY-MM-DD')

describe('TrialBadge', () => {
  it('says "Trial" when no end date is known', () => {
    render(<TrialBadge trialEndDate={null} />)
    expect(screen.getByText('Trial')).toBeInTheDocument()
  })

  it('says when the trial ends today', () => {
    render(<TrialBadge trialEndDate={inDays(0)} />)
    expect(screen.getByText('Trial ends today')).toBeInTheDocument()
  })

  it('says when the trial has ended', () => {
    render(<TrialBadge trialEndDate={inDays(-5)} />)
    expect(screen.getByText('Trial ended')).toBeInTheDocument()
  })

  it('counts a single remaining day in the singular', () => {
    render(<TrialBadge trialEndDate={inDays(1)} />)
    expect(screen.getByText('Trial · 1 day left')).toBeInTheDocument()
  })

  it('counts remaining days', () => {
    render(<TrialBadge trialEndDate={inDays(10)} />)
    expect(screen.getByText('Trial · 10 days left')).toBeInTheDocument()
  })
})
