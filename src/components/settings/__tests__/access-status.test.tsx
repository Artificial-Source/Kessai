import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockInvoke = vi.fn()
vi.mock('@/lib/api', () => ({
  apiInvoke: (...args: unknown[]) => mockInvoke(...args),
}))

import { AccessStatus } from '../access-status'

describe('AccessStatus', () => {
  beforeEach(() => vi.clearAllMocks())

  it('announces loading then shows the Tailscale identity', async () => {
    mockInvoke.mockResolvedValue({
      server_mode: 'tailscale_hosted',
      connection: 'tailscale',
      tailscale_login: 'alice@example.com',
    })
    render(<AccessStatus />)

    expect(screen.getByRole('status')).toHaveTextContent('Checking web connection')
    expect(await screen.findByText('Connected through Tailscale')).toBeVisible()
    expect(screen.getByText('alice@example.com')).toBeVisible()
    expect(mockInvoke).toHaveBeenCalledWith('get_access_status')
  })

  it.each([
    ['standalone', 'Standalone web server on this machine'],
    ['tailscale_hosted', 'Direct connection to the hosted web server'],
  ] as const)('shows a local state for %s', async (serverMode, description) => {
    mockInvoke.mockResolvedValue({
      server_mode: serverMode,
      connection: 'local',
      tailscale_login: null,
    })
    render(<AccessStatus />)

    expect(await screen.findByText('Connected locally')).toBeVisible()
    expect(screen.getByText(description)).toBeVisible()
  })

  it('reports failures accessibly', async () => {
    mockInvoke.mockRejectedValue(new Error('offline'))
    render(<AccessStatus />)

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible())
    expect(screen.getByText('Connection status unavailable')).toBeVisible()
  })
})
