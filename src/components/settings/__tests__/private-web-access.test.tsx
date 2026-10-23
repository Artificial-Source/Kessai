import { act } from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PrivateWebAccessStatus } from '@/lib/private-web-access'

const { applyMock, getStatusMock, isTauriRuntimeMock, toastErrorMock, toastSuccessMock } =
  vi.hoisted(() => ({
    applyMock: vi.fn(),
    getStatusMock: vi.fn(),
    isTauriRuntimeMock: vi.fn(),
    toastErrorMock: vi.fn(),
    toastSuccessMock: vi.fn(),
  }))

vi.mock('@/lib/private-web-access', () => ({
  applyPrivateWebAccess: applyMock,
  getPrivateWebAccessStatus: getStatusMock,
}))

vi.mock('@/lib/runtime', () => ({
  isTauriRuntime: isTauriRuntimeMock,
}))

vi.mock('sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

import { PrivateWebAccess } from '../private-web-access'

function status(overrides: Partial<PrivateWebAccessStatus> = {}): PrivateWebAccessStatus {
  return {
    state: 'stopped',
    enabled: false,
    port: 3000,
    serveCommand: 'tailscale serve --bg http://127.0.0.1:3000',
    ...overrides,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('PrivateWebAccess', () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')

  beforeEach(() => {
    vi.useRealTimers()
    applyMock.mockReset().mockResolvedValue(status())
    getStatusMock.mockReset().mockResolvedValue(status())
    isTauriRuntimeMock.mockReset().mockReturnValue(true)
    toastErrorMock.mockReset()
    toastSuccessMock.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard)
    } else {
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })

  it('renders nothing outside the Tauri runtime', () => {
    isTauriRuntimeMock.mockReturnValue(false)

    const { container } = render(<PrivateWebAccess />)

    expect(container).toBeEmptyDOMElement()
    expect(getStatusMock).not.toHaveBeenCalled()
  })

  it('shows a loading shape before the initial status resolves', () => {
    getStatusMock.mockReturnValue(new Promise<PrivateWebAccessStatus>(() => undefined))

    render(<PrivateWebAccess />)

    expect(screen.getByLabelText('Loading Private Web Access')).toBeInTheDocument()
  })

  it('renders an initial stopped status', async () => {
    render(<PrivateWebAccess />)

    expect(await screen.findByText('Stopped', { exact: true })).toBeVisible()
    expect(screen.getByLabelText('Local port')).toHaveValue('3000')
  })

  it('shows the access key only while enabled', async () => {
    getStatusMock.mockResolvedValue(
      status({ state: 'running', enabled: true, port: 9443, accessKey: 'browser-access-key' })
    )

    render(<PrivateWebAccess />)

    expect(await screen.findByText('Running', { exact: true })).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Enable Private Web Access' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByLabelText('Private Web Access key')).toHaveTextContent('browser-access-key')
    expect(screen.getByRole('button', { name: 'Copy access key' })).toBeVisible()
    expect(screen.getByText(/Disabling and re-enabling access rotates it/)).toBeVisible()
  })

  it('does not show an access key while disabled', async () => {
    render(<PrivateWebAccess />)

    expect(await screen.findByText('Stopped', { exact: true })).toBeVisible()
    expect(screen.queryByLabelText('Private Web Access key')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy access key' })).not.toBeInTheDocument()
  })

  it('renders an initial backend error status', async () => {
    getStatusMock.mockResolvedValue(status({ state: 'error', error: 'Port is already in use.' }))

    render(<PrivateWebAccess />)

    expect(await screen.findByText('Error', { exact: true })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Port is already in use.')
  })

  it('renders a shutdown timeout while the server is still stopping', async () => {
    getStatusMock.mockResolvedValue(
      status({ state: 'stopping', enabled: true, error: 'Waiting for active requests to finish.' })
    )

    render(<PrivateWebAccess />)

    expect(await screen.findByText('Stopping', { exact: true })).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('Waiting for active requests to finish.')
  })

  it('validates port boundaries before applying', async () => {
    render(<PrivateWebAccess />)
    await screen.findByText('Stopped', { exact: true })
    const portInput = screen.getByLabelText('Local port')
    const applyButton = screen.getByRole('button', { name: 'Apply changes' })

    fireEvent.change(portInput, { target: { value: '1023' } })
    fireEvent.click(applyButton)
    expect(screen.getByText('Port must be between 1024 and 65535.')).toBeVisible()
    expect(applyMock).not.toHaveBeenCalled()

    fireEvent.change(portInput, { target: { value: '1024' } })
    fireEvent.click(applyButton)
    await waitFor(() => {
      expect(applyMock).toHaveBeenLastCalledWith({ enabled: false, port: 1024 })
    })

    fireEvent.change(portInput, { target: { value: '65535' } })
    fireEvent.click(applyButton)
    await waitFor(() => {
      expect(applyMock).toHaveBeenLastCalledWith({ enabled: false, port: 65535 })
    })
  })

  it('applies start and stop changes', async () => {
    applyMock.mockImplementation(({ enabled, port }: { enabled: boolean; port: number }) =>
      Promise.resolve(status({ state: enabled ? 'running' : 'stopped', enabled, port }))
    )
    render(<PrivateWebAccess />)
    await screen.findByText('Stopped', { exact: true })

    const toggle = screen.getByRole('switch', { name: 'Enable Private Web Access' })
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(await screen.findByText('Running', { exact: true })).toBeVisible()
    expect(toastSuccessMock).toHaveBeenCalledWith('Private web access enabled')

    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    await waitFor(() => {
      expect(applyMock).toHaveBeenLastCalledWith({ enabled: false, port: 3000 })
    })
    expect(toastSuccessMock).toHaveBeenCalledWith('Private web access stopped')
  })

  it('shows a backend apply rejection', async () => {
    applyMock.mockRejectedValue(new Error('Port is unavailable.'))
    render(<PrivateWebAccess />)
    await screen.findByText('Stopped', { exact: true })

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Port is unavailable.')
    expect(toastErrorMock).toHaveBeenCalledWith('Port is unavailable.')
  })

  it('refreshes status without clobbering a dirty draft during polling', async () => {
    getStatusMock
      .mockResolvedValueOnce(status())
      .mockResolvedValueOnce(status({ state: 'running', enabled: true, port: 4000 }))
    vi.useFakeTimers()
    render(<PrivateWebAccess />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText('Stopped', { exact: true })).toBeVisible()

    fireEvent.change(screen.getByLabelText('Local port'), { target: { value: '9999' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })

    expect(screen.getByText('Running', { exact: true })).toBeVisible()
    expect(screen.getByLabelText('Local port')).toHaveValue('9999')
  })

  it.each(['status', 'error'] as const)(
    'ignores a pre-apply poll %s that arrives after the applied status',
    async (response) => {
      const poll = deferred<PrivateWebAccessStatus>()
      getStatusMock.mockResolvedValueOnce(status()).mockReturnValueOnce(poll.promise)
      applyMock.mockResolvedValue(
        status({ state: 'running', enabled: true, port: 9443, accessKey: 'new-access-key' })
      )
      vi.useFakeTimers()
      render(<PrivateWebAccess />)
      await act(async () => {
        await Promise.resolve()
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000)
      })

      fireEvent.click(screen.getByRole('switch', { name: 'Enable Private Web Access' }))
      fireEvent.change(screen.getByLabelText('Local port'), { target: { value: '9443' } })
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
      })
      expect(screen.getByRole('status')).toHaveTextContent('Running')

      await act(async () => {
        if (response === 'status') {
          poll.resolve(status())
        } else {
          poll.reject(new Error('Outdated poll failed'))
        }
      })

      expect(screen.getByRole('status')).toHaveTextContent('Running')
      expect(screen.getByLabelText('Local port')).toHaveValue('9443')
      expect(screen.getByLabelText('Private Web Access key')).toHaveTextContent('new-access-key')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }
  )

  it('pauses polling while applying and resumes after the apply completes', async () => {
    const apply = deferred<PrivateWebAccessStatus>()
    applyMock.mockReturnValue(apply.promise)
    vi.useFakeTimers()
    render(<PrivateWebAccess />)
    await act(async () => {
      await Promise.resolve()
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000)
    })
    expect(getStatusMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      apply.resolve(status())
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    expect(getStatusMock).toHaveBeenCalledTimes(2)
  })

  it('reports Serve command clipboard copy success and failure', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<PrivateWebAccess />)
    await screen.findByText('Stopped', { exact: true })

    fireEvent.click(screen.getByRole('button', { name: 'Copy Tailscale Serve command' }))
    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Serve command copied'))
    expect(writeText).toHaveBeenCalledWith('tailscale serve --bg http://127.0.0.1:3000')

    writeText.mockRejectedValueOnce(new Error('Denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy Tailscale Serve command' }))
    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith('Could not copy the Serve command.')
    )
  })

  it('copies the access key with its own action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    getStatusMock.mockResolvedValue(
      status({ state: 'running', enabled: true, accessKey: 'browser-access-key' })
    )
    render(<PrivateWebAccess />)
    await screen.findByText('Running', { exact: true })

    fireEvent.click(screen.getByRole('button', { name: 'Copy access key' }))

    await waitFor(() => expect(toastSuccessMock).toHaveBeenCalledWith('Access key copied'))
    expect(writeText).toHaveBeenCalledWith('browser-access-key')
  })
})
