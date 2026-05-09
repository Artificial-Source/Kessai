import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useKeyboardShortcuts } from '../use-keyboard-shortcuts'
import { useUiStore } from '@/stores/ui-store'

const mockNavigate = vi.fn()
let mockPathname = '/subscriptions'

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => ({ pathname: mockPathname }),
}))

function fireKey(key: string, options: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...options,
  })
  document.dispatchEvent(event)
}

describe('useKeyboardShortcuts', () => {
  beforeEach(() => {
    mockNavigate.mockClear()
    mockPathname = '/subscriptions'
    useUiStore.setState({
      subscriptionDialogOpen: false,
      editingSubscriptionId: null,
      shortcutsDialogOpen: false,
    })
  })

  it('registers keyboard event listener on mount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener')

    renderHook(() => useKeyboardShortcuts())

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    addSpy.mockRestore()
  })

  it('removes keyboard event listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const { unmount } = renderHook(() => useKeyboardShortcuts())
    unmount()

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('opens subscription dialog on "n" key', () => {
    renderHook(() => useKeyboardShortcuts())

    fireKey('n')

    expect(useUiStore.getState().subscriptionDialogOpen).toBe(true)
  })

  it('opens subscription dialog on "N" key', () => {
    renderHook(() => useKeyboardShortcuts())

    fireKey('N')

    expect(useUiStore.getState().subscriptionDialogOpen).toBe(true)
  })

  it('focuses search input on "/" key when on subscriptions page', () => {
    mockPathname = '/subscriptions'
    const mockInput = document.createElement('input')
    mockInput.placeholder = 'Search subscriptions...'
    document.body.appendChild(mockInput)
    const focusSpy = vi.spyOn(mockInput, 'focus')

    renderHook(() => useKeyboardShortcuts())
    fireKey('/')

    expect(focusSpy).toHaveBeenCalled()
    document.body.removeChild(mockInput)
    focusSpy.mockRestore()
  })

  it('does not focus search on "/" key when not on subscriptions page', () => {
    mockPathname = '/'
    const mockInput = document.createElement('input')
    mockInput.placeholder = 'Search subscriptions...'
    document.body.appendChild(mockInput)
    const focusSpy = vi.spyOn(mockInput, 'focus')

    renderHook(() => useKeyboardShortcuts())
    fireKey('/')

    expect(focusSpy).not.toHaveBeenCalled()
    document.body.removeChild(mockInput)
    focusSpy.mockRestore()
  })

  it('opens shortcuts dialog on "?" key', () => {
    renderHook(() => useKeyboardShortcuts())

    act(() => {
      fireKey('?')
    })
    expect(useUiStore.getState().shortcutsDialogOpen).toBe(true)
  })

  it('closes shortcuts dialog on "?" key when already open', () => {
    useUiStore.setState({ shortcutsDialogOpen: true })

    renderHook(() => useKeyboardShortcuts())

    act(() => {
      fireKey('?')
    })
    expect(useUiStore.getState().shortcutsDialogOpen).toBe(false)
  })

  it('closes shortcuts dialog on Escape', () => {
    useUiStore.setState({ shortcutsDialogOpen: true })

    renderHook(() => useKeyboardShortcuts())
    fireKey('Escape')

    expect(useUiStore.getState().shortcutsDialogOpen).toBe(false)
  })

  it('closes subscription dialog on Escape', () => {
    useUiStore.setState({ subscriptionDialogOpen: true })

    renderHook(() => useKeyboardShortcuts())
    fireKey('Escape')

    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)
  })

  it('ignores shortcuts when target is an input element', () => {
    renderHook(() => useKeyboardShortcuts())

    const input = document.createElement('input')
    document.body.appendChild(input)
    const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true })
    Object.defineProperty(event, 'target', { value: input })
    document.dispatchEvent(event)

    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)
    document.body.removeChild(input)
  })

  it('ignores shortcuts when target is a textarea element', () => {
    renderHook(() => useKeyboardShortcuts())

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    const event = new KeyboardEvent('keydown', { key: 'n', bubbles: true })
    Object.defineProperty(event, 'target', { value: textarea })
    document.dispatchEvent(event)

    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)
    document.body.removeChild(textarea)
  })

  it('ignores shortcuts when modifier keys are held', () => {
    renderHook(() => useKeyboardShortcuts())

    fireKey('n', { ctrlKey: true })
    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)

    fireKey('n', { metaKey: true })
    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)

    fireKey('n', { altKey: true })
    expect(useUiStore.getState().subscriptionDialogOpen).toBe(false)
  })

  it('navigates to pages with number keys', () => {
    renderHook(() => useKeyboardShortcuts())

    fireKey('1')
    expect(mockNavigate).toHaveBeenCalledWith('/')

    fireKey('2')
    expect(mockNavigate).toHaveBeenCalledWith('/subscriptions')

    fireKey('3')
    expect(mockNavigate).toHaveBeenCalledWith('/calendar')

    fireKey('4')
    expect(mockNavigate).toHaveBeenCalledWith('/settings')
  })

  it('does not process shortcuts when subscription dialog is open', () => {
    useUiStore.setState({ subscriptionDialogOpen: true })

    renderHook(() => useKeyboardShortcuts())
    fireKey('1')

    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
