import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { useCategoryStore } from '@/stores/category-store'
import { usePaymentCardStore } from '@/stores/payment-card-store'
import { useSettingsStore } from '@/stores/settings-store'
import { useTagStore } from '@/stores/tag-store'
import { DEFAULT_SETTINGS } from '@/types/settings'
import type * as ApiModule from '@/lib/api'

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiModule>()),
  apiInvoke: invoke,
}))
vi.mock('@/lib/runtime', () => ({ isTauriRuntime: () => false }))
vi.mock('@/components/theme-provider', () => ({
  useTheme: () => ({ theme: 'dark', setTheme: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }))

import { SettingsPage } from '../settings'

/** Section tops relative to the scroll area's top edge (the activation line sits at 96px). */
let sectionTops: Record<string, number>
const scrollIntoView = vi.fn()

/** A ResizeObserver whose size changes the test triggers by hand. */
class ManualResizeObserver {
  static instances: ManualResizeObserver[] = []
  private connected = true
  constructor(private readonly callback: ResizeObserverCallback) {
    ManualResizeObserver.instances.push(this)
  }
  observe() {}
  unobserve() {}
  disconnect() {
    this.connected = false
  }
  static resizeAll() {
    for (const observer of ManualResizeObserver.instances) {
      if (observer.connected) observer.callback([], observer as unknown as ResizeObserver)
    }
  }
}

function renderSettings() {
  render(
    <main id="main-content">
      <SettingsPage />
    </main>,
    { wrapper: MemoryRouter }
  )
}

const nav = () => screen.getByRole('navigation', { name: 'Settings sections' })
const current = () =>
  within(nav())
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'true')
    .map((link) => link.textContent)

/** Puts the scroll area at `scrollTop` (of 6000px content in an 800px viewport) and scrolls. */
function scrollMainTo(scrollTop: number) {
  const root = document.getElementById('main-content')!
  Object.defineProperties(root, {
    scrollTop: { configurable: true, value: scrollTop },
    clientHeight: { configurable: true, value: 800 },
    scrollHeight: { configurable: true, value: 6000 },
  })
  fireEvent.scroll(root)
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/settings')
  sectionTops = {}
  Element.prototype.scrollIntoView = scrollIntoView
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  )
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    const top = sectionTops[this.id] ?? 0
    return { top, bottom: top + 300, left: 0, right: 0, width: 0, height: 300, x: 0, y: top }
  } as () => DOMRect)

  const settings = { id: 'singleton', ...DEFAULT_SETTINGS, currency: 'USD' }
  useSettingsStore.setState({ settings: null, isLoading: false, error: null })
  useCategoryStore.setState({ categories: [], isLoading: false, error: null })
  useTagStore.setState({ tags: [], isLoading: false, error: null })
  usePaymentCardStore.setState({ cards: [], isLoading: false, error: null })
  invoke.mockImplementation(async (command: string) => {
    switch (command) {
      case 'get_settings':
        return settings
      case 'list_categories':
      case 'list_tags':
      case 'list_payment_cards':
        return []
      case 'get_access_status':
        return { mode: 'local' }
      default:
        throw new Error(`Unexpected command: ${command}`)
    }
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Settings section navigation', () => {
  it('marks the clicked section current and holds it while the jump scrolls', async () => {
    renderSettings()
    await screen.findByRole('navigation', { name: 'Settings sections' })
    expect(current()).toEqual(['Appearance'])

    fireEvent.click(within(nav()).getByRole('link', { name: 'About' }))

    expect(current()).toEqual(['About'])
    expect(window.location.hash).toBe('#about')
    const [lastScrolled] = scrollIntoView.mock.contexts.slice(-1)
    expect(lastScrolled).toBe(document.getElementById('about'))
    expect(document.activeElement).toBe(document.getElementById('about-title'))

    // Mid-jump scroll events report sections the smooth scroll passes; About stays current.
    sectionTops = { appearance: -400, budget: 20, notifications: 600 }
    scrollMainTo(1000)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(current()).toEqual(['About'])
  })

  it('tracks the last section above the activation line once the jump settles', async () => {
    renderSettings()
    await screen.findByRole('navigation', { name: 'Settings sections' })
    fireEvent.click(within(nav()).getByRole('link', { name: 'Tags' }))
    expect(current()).toEqual(['Tags'])
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)))

    sectionTops = {
      appearance: -1200,
      budget: -900,
      notifications: -500,
      categories: 40,
      tags: 500,
    }
    scrollMainTo(1200)
    await waitFor(() => expect(current()).toEqual(['Categories']))

    // At the end of the page the last section is current even though its top never
    // reaches the activation line.
    sectionTops = { motion: 300, about: 520 }
    scrollMainTo(5200)
    await waitFor(() => expect(current()).toEqual(['About']))
  })

  it('opens a #data deep link on Data & Backup', async () => {
    window.history.replaceState(null, '', '/settings#data')
    renderSettings()

    // The nav has just mounted, so the deep-link jump hold is fresh: scroll immediately
    // (no awaits in between) to simulate the browser landing with Payment Cards still
    // near the top. Data must stay current.
    await screen.findByRole('navigation', { name: 'Settings sections' })
    sectionTops = { categories: -700, tags: -300, cards: 10, data: 140 }
    scrollMainTo(2400)

    await waitFor(() => expect(current()).toEqual(['Data & Backup']))
    await waitFor(() =>
      expect(scrollIntoView.mock.contexts).toContain(document.getElementById('data'))
    )
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(current()).toEqual(['Data & Backup'])
  })

  it('keeps a deep-linked section pinned while the sections above it load', async () => {
    ManualResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', ManualResizeObserver)
    window.history.replaceState(null, '', '/settings#data')
    renderSettings()
    await screen.findByRole('navigation', { name: 'Settings sections' })
    const data = document.getElementById('data')
    const pins = () => scrollIntoView.mock.contexts.filter((element) => element === data).length
    const landed = pins()
    expect(landed).toBeGreaterThan(0)

    // Categories, tags, and cards finish loading above Data and push it down: it re-pins.
    act(() => ManualResizeObserver.resizeAll())
    expect(pins()).toBe(landed + 1)

    // Once the person scrolls, the page is theirs.
    fireEvent.wheel(window)
    act(() => ManualResizeObserver.resizeAll())
    expect(pins()).toBe(landed + 1)
  })

  it('keeps a jumped-to section near the end current while its top is in the activation band', async () => {
    window.history.replaceState(null, '', '/settings#motion')
    renderSettings()
    await screen.findByRole('navigation', { name: 'Settings sections' })
    expect(current()).toEqual(['Motion'])
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)))

    // Motion and About fit one screen: the page bottoms out with Motion 51px down. A late
    // re-pin scroll after the jump settled must not hand the highlight to About.
    sectionTops = { data: -311, motion: 51, about: 549 }
    scrollMainTo(5200)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(current()).toEqual(['Motion'])

    // Scrolling up moves Motion below the line: normal tracking resumes and the pin is gone.
    sectionTops = { cards: -480, data: -211, motion: 151, about: 649 }
    scrollMainTo(5100)
    await waitFor(() => expect(current()).toEqual(['Data & Backup']))
    sectionTops = { data: -311, motion: 51, about: 549 }
    scrollMainTo(5200)
    await waitFor(() => expect(current()).toEqual(['About']))

    // A click pins the same way.
    fireEvent.click(within(nav()).getByRole('link', { name: 'Motion' }))
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)))
    scrollMainTo(5200)
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)))
    expect(current()).toEqual(['Motion'])
  })
})
