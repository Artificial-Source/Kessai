import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getAutostartMock, mutateAutostartMock, isTauriRuntimeMock } = vi.hoisted(() => ({
  getAutostartMock: vi.fn(),
  mutateAutostartMock: vi.fn(),
  isTauriRuntimeMock: vi.fn(),
}))

vi.mock('@/lib/autostart', () => ({
  getAutostartEnabled: getAutostartMock,
  mutateAutostartEnabled: mutateAutostartMock,
}))

vi.mock('@/lib/runtime', () => ({
  isTauriRuntime: isTauriRuntimeMock,
}))

import { AutostartSettings } from '../autostart-settings'

describe('AutostartSettings', () => {
  beforeEach(() => {
    getAutostartMock.mockReset().mockResolvedValue(false)
    mutateAutostartMock.mockReset().mockResolvedValue(undefined)
    isTauriRuntimeMock.mockReset().mockReturnValue(true)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders nothing outside the Tauri runtime', () => {
    isTauriRuntimeMock.mockReturnValue(false)

    const { container } = render(<AutostartSettings />)

    expect(container).toBeEmptyDOMElement()
    expect(getAutostartMock).not.toHaveBeenCalled()
  })

  it('shows a loading shape while checking autostart status', () => {
    getAutostartMock.mockReturnValue(new Promise<boolean>(() => undefined))

    render(<AutostartSettings />)

    expect(screen.getByText('Launch Kessai at login')).toBeVisible()
    expect(screen.getByText('Checking system setting…')).toBeVisible()
  })

  it('loads and displays the autostart toggle reflecting OS state', async () => {
    getAutostartMock.mockResolvedValue(false)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
    expect(screen.getByText(/Starts Kessai hidden in the tray at OS user login/i)).toBeVisible()
    expect(screen.getByText(/explicit Quit stops both/i)).toBeVisible()
  })

  it('awaits actual returned OS state on enable', async () => {
    getAutostartMock.mockResolvedValueOnce(false).mockResolvedValue(true)
    mutateAutostartMock.mockResolvedValue(undefined)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
  })

  it('awaits actual returned OS state on disable', async () => {
    getAutostartMock.mockResolvedValueOnce(true).mockResolvedValue(false)
    mutateAutostartMock.mockResolvedValue(undefined)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(false))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
  })

  it('reconciles actual OS state when mutation rejects, without showing stale state', async () => {
    getAutostartMock.mockResolvedValue(true)
    mutateAutostartMock.mockRejectedValue(new Error('OS error'))

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(false))
    await waitFor(() => expect(getAutostartMock).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByRole('alert')).toHaveTextContent('did not take effect')
  })

  it('shows unknown state and status-only retry when verification fails after mutation', async () => {
    getAutostartMock.mockResolvedValueOnce(false).mockRejectedValue(new Error('read failed'))
    mutateAutostartMock.mockResolvedValue(undefined)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(screen.getByText(/Could not confirm the login-start status/i)).toBeVisible()
    )
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible()
    expect(screen.queryByRole('switch', { name: 'Launch Kessai at login' })).toBeNull()
  })

  it('surfaces a role=alert and reflects actual state when a successful mutation does not take effect', async () => {
    getAutostartMock.mockResolvedValue(true)
    mutateAutostartMock.mockResolvedValue(undefined)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(false))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
    expect(screen.getByRole('alert')).toHaveTextContent('did not take effect')
  })

  it('reports reconciled success when a rejected mutation is already in the desired state', async () => {
    getAutostartMock.mockResolvedValueOnce(false).mockResolvedValue(true)
    mutateAutostartMock.mockRejectedValue(new Error('OS error'))

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() => expect(mutateAutostartMock).toHaveBeenCalledWith(true))
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
    expect(screen.queryByRole('alert')).toBeNull()
    await waitFor(() => expect(screen.getByRole('status')).toBeVisible())
    expect(screen.getByRole('status')).toHaveTextContent(/enabled/)
    expect(screen.getByRole('status')).toHaveTextContent(/despite the error/)
  })

  it('status retry reads status only and never repeats enable/disable', async () => {
    getAutostartMock
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('read failed'))
      .mockResolvedValue(true)
    mutateAutostartMock.mockResolvedValue(undefined)

    render(<AutostartSettings />)

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'false'
      )
    )
    fireEvent.click(screen.getByRole('switch', { name: 'Launch Kessai at login' }))
    await waitFor(() =>
      expect(screen.getByText(/Could not confirm the login-start status/i)).toBeVisible()
    )

    const mutateCallCount = mutateAutostartMock.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(getAutostartMock).toHaveBeenCalledTimes(3))
    expect(mutateAutostartMock.mock.calls.length).toBe(mutateCallCount)
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Launch Kessai at login' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    )
  })
})
